import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingInvoiceEntryOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Alış faturası girişi" standart tanımı (sales-purchase-invoice-entry.json): receiptId ön seçimi, sunucu önizlemesi,
// malKabul.faturala gövdesi ve kayıttan sonra Alış faturalarına geçiş. Taslak 20: "Fatura fiyatları" ızgarası mal kabul
// fiyatıyla dolar, bedelsiz/fiyatsız satır "Tutar girin" ile işaretlenir ve satırlar `lines` olarak gönderilir.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-invoice-entry';
const R1 = '77777777-0000-0000-0000-000000000001';
const R2 = '77777777-0000-0000-0000-000000000002';
const option = (id: string, code: string) => ({
  id, receiptCode: code, purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0001', supplierId: 's1', supplierName: 'Ege Ambalaj',
  receiptDate: '2026-11-10', warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo', lineCount: 1, currencyCode: 'TRY', purchaseOrderTotal: 8400,
});
const previewLine = (extra: Record<string, unknown> = {}) => ({
  orderLineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', quantity: 200, enteredQuantity: 200, enteredUnitCode: 'ADET', unitPrice: 35,
  receiptUnitPrice: 35, discountPercent: 0, discountAmount: 0, lineSubtotal: 7000, vatPercent: 20, taxAmount: 1400, lineTotal: 8400,
  isFreeOfCharge: false, requiresAmount: false, ...extra,
});
/** A second receipt line that came in free of charge: no receipt price, so the invoice needs its amount. */
let freeLine = false;
const preview = (id: string) => ({
  receiptId: id, receiptCode: id === R1 ? 'MK-0001' : 'MK-0002', supplierName: 'Ege Ambalaj', purchaseOrderCode: 'SA-0001', currencyCode: 'TRY',
  subtotal: 7000, discountTotal: 0, taxTotal: 1400, grandTotal: 8400, dueDate: '2026-12-10', paymentTermDays: 30, accountingProfileCode: 'TR-LOCAL',
  lines: [
    previewLine(),
    ...(freeLine
      ? [previewLine({ orderLineNumber: 2, stockCode: 'PRM-1', stockName: 'Promosyon kutusu', quantity: 50, enteredQuantity: 50, unitPrice: 0, receiptUnitPrice: null,
          lineSubtotal: 0, taxAmount: 0, lineTotal: 0, isFreeOfCharge: true, requiresAmount: true })]
      : []),
  ],
});

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/purchasing/invoices/entry/receipts') return page([option(R1, 'MK-0001'), option(R2, 'MK-0002')]);
    const pv = /^\/api\/purchasing\/receipts\/([^/]+)\/invoice-preview$/.exec(path);
    if (pv) return preview(pv[1]);
    if (path === '/api/finance/general-ledger/rule-profiles') return [{ profileCode: 'TR-LOCAL', name: 'Türkiye', isActive: true, hasTaxRules: true }];
  }
  if (method === 'POST' && path === `/api/purchasing/receipts/${R1}/invoice`) return { id: 'pi9', code: 'AF-9', grandTotal: 8400, currencyCode: 'TRY' };
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(() => { freeLine = false; h.before(); });
afterEach(() => h.after(['sales-purchase-invoices']));
const previews = () => h.state.calls.filter((call) => call.method === 'GET' && /\/invoice-preview$/.test(call.url.split('?')[0]));

describe('Alış faturası girişi standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('without receiptId lists the invoiceable receipts and asks for no preview', async () => {
    h.setup(respond);
    await h.cell(/MK-0001/);
    await h.settle(100);
    expect(previews()).toEqual([]);
    expect(screen.queryByLabelText(/Tedarikçi fatura no/)).toBeNull();
  });

  it('receiptId preselects the receipt; header and lines come from the server preview', async () => {
    h.setup(respond, { params: { receiptId: R1 } });
    expect(await screen.findByText('Alış faturası · MK-0001', {}, T)).toBeTruthy();
    await waitFor(() => expect(previews().length).toBeGreaterThan(0), T);
    expect(previews().every((call) => call.url.startsWith(`/api/purchasing/receipts/${R1}/invoice-preview`))).toBe(true);
    expect(new URLSearchParams(previews()[0].url.split('?')[1]).get('invoiceDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByText('Koli 40x30', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T)).toBeTruthy();
    expect(screen.getByLabelText(/Tedarikçi fatura no/)).toBeTruthy();
  });

  it('Kaydet posts malKabul.faturala with the entered fields, then opens Alış faturaları', async () => {
    h.setup(respond, { params: { receiptId: R1 } });
    await screen.findByText('Alış faturası · MK-0001', {}, T);
    fireEvent.change(await screen.findByLabelText(/Tedarikçi fatura no/, {}, T), { target: { value: 'TF-123' } });
    await h.ready('save');
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0].url).toBe(`/api/purchasing/receipts/${R1}/invoice`);
    const body = h.bodyOf(h.writes()[0]);
    expect(body).toMatchObject({ code: 'TF-123' });
    expect(body.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(body).every((name) => ['code', 'invoiceDate', 'accountingProfileCode', 'providerInvoiceUuid', 'providerScenario', 'providerInvoiceTypeCode', 'providerSenderAlias', 'lines'].includes(name))).toBe(true);
    // The price grid is filled from the receipt price and goes as the per-line invoice prices.
    expect(body.lines).toEqual([expect.objectContaining({ orderLineNumber: 1, unitPrice: 35, discountPercent: 0, vatPercent: 20 })]);
    await waitFor(() => expect(h.state.navigations.some((item) => item.page === 'sales-purchase-invoices')).toBe(true), T);
  });

  it('taslak 20: a free receipt line is marked "Tutar girin" and starts without a price', async () => {
    freeLine = true;
    h.setup(respond, { params: { receiptId: R1 } });
    await screen.findByText('Alış faturası · MK-0001', {}, T);
    expect(await screen.findByText('Tutar girin', {}, T)).toBeTruthy();
    expect(screen.getAllByText('Promosyon kutusu').length).toBeGreaterThan(0);
  });

  it('a list row opens the entry form for that receipt', async () => {
    h.setup(respond);
    fireEvent.doubleClick(await h.cell(/MK-0002/));
    expect(await screen.findByText('Alış faturası · MK-0002', {}, T)).toBeTruthy();
    await waitFor(() => expect(previews().some((call) => call.url.startsWith(`/api/purchasing/receipts/${R2}/invoice-preview`))).toBe(true), T);
  });
});
