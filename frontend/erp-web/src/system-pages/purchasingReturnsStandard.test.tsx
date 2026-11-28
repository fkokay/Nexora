import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingReturnsOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Alış iadeleri" standart tanımı (sales-purchase-returns.json, v3): Liste kalıbı ve pencereler, onaylı iptal, eski ekrana geçiş ve
// seçilen faturanın iade edilebilir satırlarından yeni iade (fill + skipWhenZero, autoId requestId).

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-returns';
const S1 = 'aaaaaaaa-1111-0000-0000-000000000001';
const S2 = 'aaaaaaaa-1111-0000-0000-000000000002';
const INV = '88888888-0000-0000-0000-000000000001';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const IL1 = 'dddddddd-0000-0000-0000-000000000001';
const IL2 = 'dddddddd-0000-0000-0000-000000000002';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const invoice = (id: string, code: string, status: string) => ({ id, code, supplierId: 's1', supplierName: 'Ege Ambalaj', invoiceDate: '2026-11-05', currencyCode: 'TRY',
  status, grandTotal: 1200, paidAmount: 0, outstandingAmount: 1200, lineCount: 2 });
const returnable = (id: string, n: number, code: string, invoiced: number, returned: number) => ({
  purchaseInvoiceLineId: id, orderLineNumber: n, stockItemId: `st${n}`, stockCode: code, stockName: `${code} adı`, unitCode: 'ADET', invoicedQuantity: invoiced,
  returnedQuantity: returned, remainingQuantity: invoiced - returned, unitPrice: 200, discountPercent: 0, vatPercent: 20,
});
let returnFailure: string | null = null;
const ret = (id: string, code: string, status: string) => ({
  id, code, returnDate: '2026-11-12', supplierId: 's1', supplierName: 'Ege Ambalaj', purchaseInvoiceId: INV, invoiceCode: 'AF-0001',
  warehouseId: 'w1', warehouseName: 'Ana depo', lineCount: 1, grandTotal: 240, currencyCode: 'TRY', status, createdAt: '2026-11-12',
});
const rows = () => [ret(S1, 'AI-0001', 'Posted'), ret(S2, 'AI-0002', 'Voided')];

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/purchasing/returns') return page(rows());
    const one = /^\/api\/purchasing\/returns\/([^/]+)$/.exec(path);
    if (one) {
      return { ...rows().find((row) => row.id === one[1]), subtotal: 200, discountTotal: 0, taxTotal: 40, notes: null,
        lines: [{ orderLineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 1, enteredQuantity: 1, unitPrice: 200, discountAmount: 0, vatPercent: 20, taxAmount: 40, lineTotal: 240 }] };
    }
  }
  if (method === 'GET') {
    if (path === '/api/purchasing/invoices') return page([invoice(INV, 'AF-0001', 'Posted'), invoice('88888888-0000-0000-0000-000000000002', 'AF-0002', 'Voided')]);
    if (path === `/api/purchasing/invoices/${INV}/returnable-lines`) return [returnable(IL1, 1, 'AMB-1', 4, 1), returnable(IL2, 2, 'AMB-2', 2, 2)];
    if (path === '/api/warehouses') return [{ id: W1, code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'rv' }];
    if (path === `/api/warehouses/${W1}/locations`) return [];
  }
  if (method === 'POST' && /^\/api\/purchasing\/returns\/[^/]+\/void$/.test(path)) return {};
  if (method === 'POST' && path === `/api/purchasing/invoices/${INV}/returns`) {
    if (returnFailure) { const message = returnFailure; returnFailure = null; throw Object.assign(new Error(message), { status: 409, serverError: message }); }
    return { id: 'ret9', code: 'AI-0009', purchaseInvoiceId: INV, status: 'Posted' };
  }
  return undefined;
}

const h = createHarness(KEY, catalog);
const rowAction = async (code: string, name: RegExp) => within(await h.row(code)).findByRole('button', { name }, T);
beforeEach(() => { h.before(); returnFailure = null; });
afterEach(() => h.after(['sales-purchase-invoices']));

describe('Alış iadeleri standart tanımı', { timeout: 60000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the returns and opens the read-only document with its lines', async () => {
    h.setup(respond);
    await h.select('AI-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/returns/${S1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await rowAction('AI-0001', /^Aç/));
    const dialog = await screen.findByRole('dialog', { name: /Alış iadesi · AI-0001/ }, T);
    expect(await within(dialog).findByText('Koli 40x30', { selector: 'td, td *' }, T)).toBeTruthy();
    expect(h.writes()).toEqual([]);
  });

  it('İadeyi iptal et asks first and voids the selected return', async () => {
    h.setup(respond);
    await h.select('AI-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/returns/${S1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await rowAction('AI-0001', /^İptal et/));
    expect((await screen.findByRole('alertdialog', {}, T)).textContent).toContain('AI-0001 alış iadesi iptal edilsin mi?');
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/returns/${S1}/void` });
  });

  it('Faturayı aç opens the legacy invoice screen with purchaseInvoiceId', async () => {
    h.setup(respond);
    await h.select('AI-0002');
    fireEvent.click(await rowAction('AI-0002', /^Faturayı aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchase-invoices', params: { purchaseInvoiceId: INV }, legacy: true });
  });

  it('Yeni iade picks a posted invoice, fills its returnable lines and posts only the non-zero ones with a requestId', async () => {
    h.setup(respond);
    await h.cell('AI-0001');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni alış iadesi' }, T);
    // Yalnız işlenmiş faturalar seçilebilir.
    fireEvent.click(h.input('iadeFatura'));
    await screen.findByRole('option', { name: /^AF-0001/ }, T);
    expect(screen.queryByRole('option', { name: /^AF-0002/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: /^AF-0001/ }));
    await waitFor(() => expect(h.gridCell('iadeKalemleri', 'dolu-1', 'quantity')?.value).toBe('3'), T);
    expect(h.gridCell('iadeKalemleri', 'dolu-2', 'quantity')!.value).toBe('0');
    expect(await within(dialog).findByText(/Gönderilecek satır: 1\./, {}, T)).toBeTruthy();
    await h.pick(h.input('iadeDepo'), 'Ana depo');
    h.type(h.gridCell('iadeKalemleri', 'dolu-1', 'quantity')!, '2');
    returnFailure = 'İade miktarı depodaki stoğu aşıyor.';
    fireEvent.click(within(dialog).getByRole('button', { name: 'İadeyi kaydet' }));
    expect(await within(dialog).findByText(/İade miktarı depodaki stoğu aşıyor\./, {}, T)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'İadeyi kaydet' }));
    const url = `/api/purchasing/invoices/${INV}/returns`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(2), T);
    const [first, second] = h.sent(url).map((call) => h.bodyOf(call));
    expect(second).toEqual({ requestId: expect.stringMatching(GUID), warehouseId: W1, returnDate: today(),
      lines: [{ purchaseInvoiceLineId: IL1, quantity: 2, unitCode: 'ADET' }] });
    // Yeniden deneme aynı istek kimliğini taşır (sunucu aynı içerikte var olan iadeyi döner).
    expect(second.requestId).toBe(first.requestId);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni alış iadesi' })).toBeNull(), T);
  });

  it('the list has no legacy screen action', async () => {
    h.setup(respond);
    await h.cell('AI-0001');
    await h.ready('new');
    expect(screen.queryByRole('button', { name: /Eski ekranda aç/ })).toBeNull();
  });
});
