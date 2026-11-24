import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageParams } from '../pageNavigation';
import catalog from './salesInvoicesOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Satış Faturaları" standart tanımı (sales-invoices.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `salesInvoicesOperations.fixture.json` ErpOperationCatalog'un bu sayfanın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-invoices';
const I1 = '99999999-0000-0000-0000-000000000001';
const I2 = '99999999-0000-0000-0000-000000000002';
const C1 = '22222222-0000-0000-0000-000000000001';
const A1 = '77777777-0000-0000-0000-000000000001';
const COL1 = '88888888-0000-0000-0000-000000000001';
const R1 = '66666666-0000-0000-0000-000000000001';

const invoice = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, deliveryId: 'd1', deliveryCode: 'IRS-1', orderId: 'o1', orderCode: 'S-1', customerId: C1, customerName: 'Acme', invoiceDate: '2026-11-04',
  currencyCode: 'TRY', status, grandTotal: 1200, lineCount: 1, createdAt: '2026-11-04T08:00:00Z', invoiceType: 'Wholesale', ...extra,
});
const detail = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  ...invoice(id, code, status), subtotal: 1000, discountTotal: 0, taxTotal: 200, paidAmount: 200, returnedAmount: 0, outstandingAmount: 1000, ledgerEntryId: 'le1',
  notes: null, customFields: [], eDocumentScenario: null, eDocumentTypeCode: null, eDocumentRecipientAlias: null,
  lines: [{ orderLineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli', unitCode: 'ADET', quantity: 10, unitPrice: 100, discountPercent: 0,
    discountAmount: 0, vatPercent: 20, taxAmount: 200, lineSubtotal: 1000, lineTotal: 1200 }],
  collections: [{ id: COL1, code: 'TAH-1', customerId: C1, customerName: 'Acme', salesInvoiceId: id, invoiceCode: code, collectionDate: '2026-11-05', amount: 200,
    currencyCode: 'TRY', paymentMethod: 'Cash', reference: null, status: 'Posted', createdAt: '2026-11-05T08:00:00Z', financialAccountId: A1, financialAccountName: 'Merkez kasa' }],
  returns: [{ id: R1, code: 'IADE-1', salesInvoiceId: id, invoiceCode: code, warehouseId: 'w1', warehouseName: 'Merkez', returnDate: '2026-11-06', status: 'Posted',
    grandTotal: 100, lineCount: 1, createdAt: '2026-11-06T08:00:00Z', lines: [] }],
  ...extra,
});

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/sales/invoices') {
      return page([invoice(I1, 'F-1', 'Posted'), invoice(I2, 'F-2', 'Voided')], { pageGrandTotal: 1200, pageCurrencyCode: 'TRY', pageMixedCurrencies: false, pagePostedCount: 1 });
    }
    if (path === `/api/sales/invoices/${I1}`) return detail(I1, 'F-1', 'Posted');
    if (path === `/api/sales/invoices/${I2}`) return detail(I2, 'F-2', 'Voided', { paidAmount: 0, outstandingAmount: 0, collections: [], returns: [] });
    if (path === '/api/finance/accounts') return [{ id: A1, code: 'K1', name: 'Merkez kasa', type: 'Cash', currencyCode: 'TRY', isActive: true }];
  } else if (method === 'POST') {
    if (path === `/api/sales/invoices/${I1}/collections`) return { id: 'col2', code: 'TAH-2', status: 'Posted', amount: 1000 };
    if (path === `/api/customer-collections/${COL1}/void`) return null;
    if (path === `/api/sales/returns/${R1}/void`) return null;
    if (path === `/api/sales/invoices/${I1}/void`) return null;
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); h.listen(); });
afterEach(() => { h.reset(); cleanup(); setPageParams(KEY, {}); });

const openInvoice = async (code: string) => {
  await h.selectRow(code);
  await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
  fireEvent.click(h.command('open'));
  return h.dialog(new RegExp(`Satış faturası · ${code}`));
};

describe('Satış Faturaları standart tanımı', { timeout: 30000 }, () => {
  it('is a v1 preview standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 2, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('the customerId page param filters the list and invoiceId opens that invoice', async () => {
    setPageParams(KEY, { customerId: C1, invoiceId: I1 });
    h.setup();
    const opened = await h.dialog(/Satış faturası · F-1/);
    expect(query(h.gets('/api/sales/invoices')[0].url).get('customerId')).toBe(C1);
    expect(query(h.gets('/api/sales/invoices')[0].url).get('pageSize')).toBe('25');
    expect(screen.getByText('Seçili carinin faturaları gösteriliyor.')).toBeTruthy();
    await waitFor(() => expect(opened.textContent).toContain('STK-1'), T);
  });

  it('shows the page total of posted invoices and the cancelled counter', async () => {
    h.setup();
    await screen.findByText('F-1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    await waitFor(() => expect(document.body.textContent).toContain('1 fatura · bu sayfa · TRY'), T);
    expect(screen.queryByText('Seçili carinin faturaları gösteriliyor.')).toBeNull();
  });

  it('Tahsilatı kaydet posts with a stable requestId and the selected account', async () => {
    h.setup();
    const opened = await openInvoice('F-1');
    fireEvent.click(within(opened).getByRole('tab', { name: /Tahsilatlar/ }));
    await within(opened).findByText('TAH-1', {}, T);
    fireEvent.click(within(opened).getByRole('combobox', { name: /Kasa \/ banka hesabı/ }));
    fireEvent.click(await screen.findByRole('option', { name: /^Merkez kasa/ }, T));
    fireEvent.click(within(opened).getByRole('button', { name: 'Tahsilatı kaydet' }));
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/sales/invoices/${I1}/collections` });
    const body = JSON.parse(h.writes()[0].body!);
    expect(body).toMatchObject({ amount: 1000, paymentMethod: 'Bank transfer', financialAccountId: A1 });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('collection and return rows cancel after confirmation; fatura iptal is admin-only with the agreed text', async () => {
    h.setup();
    const opened = await openInvoice('F-1');
    expect(within(opened).queryByRole('button', { name: 'Faturayı iptal et' })).toBeTruthy();
    fireEvent.click(within(opened).getByRole('tab', { name: /Tahsilatlar/ }));
    const collection = (await within(opened).findByText('TAH-1', {}, T)).closest('tr')!;
    fireEvent.click(within(collection).getByRole('button', { name: 'İptal et' }));
    await h.confirm('“TAH-1” tahsilatı iptal edilsin mi?');
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/customer-collections/${COL1}/void` });
    fireEvent.click(within(opened).getByRole('tab', { name: /İadeler/ }));
    const ret = (await within(opened).findByText('IADE-1', {}, T)).closest('tr')!;
    fireEvent.click(within(ret).getByRole('button', { name: 'İptal et' }));
    await h.confirm('“IADE-1” iadesi iptal edilsin mi?');
    await h.waitWrites(2);
    expect(h.writes()[1]).toMatchObject({ method: 'POST', url: `/api/sales/returns/${R1}/void` });
    fireEvent.click(within(opened).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), T);
    fireEvent.click(await h.menuItem(/İptal et/));
    await h.confirm('“F-1” iptal edilecek ve cari hareketi ters kayıtla kapatılacak.');
    await h.waitWrites(3);
    expect(h.writes()[2]).toMatchObject({ method: 'POST', url: `/api/sales/invoices/${I1}/void` });
  });

  it('Yeni keeps opening the legacy invoice card (G-SI6 gate) with the customer filter', async () => {
    setPageParams(KEY, { customerId: C1 });
    h.setup();
    await screen.findByText('F-1', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    fireEvent.click(h.command('new'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-invoice-create', params: { customerId: C1 }, legacy: true });
  });

  it('İade ekle opens the legacy invoice screen; a TenantUser cannot cancel the invoice', async () => {
    h.setup('TenantUser');
    const opened = await openInvoice('F-1');
    expect(within(opened).queryByRole('button', { name: 'Faturayı iptal et' })).toBeNull();
    fireEvent.click(within(opened).getByRole('button', { name: /İade ekle/ }));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { invoiceId: I1 }, legacy: true });
  });
});
