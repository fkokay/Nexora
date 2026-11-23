import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingInvoicesOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Alış faturaları" standart tanımı (sales-purchase-invoices.json, v2): ödeme durumu, supplierId süzgeci, ödeme penceresi
// (autoId requestId), ödeme iptali, fatura iptali ve iade edilebilir satırlardan iade (fill + skipWhenZero, autoId requestId).

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-invoices';
const I1 = '88888888-0000-0000-0000-000000000001';
const I2 = '88888888-0000-0000-0000-000000000002';
const PAY = '99999999-0000-0000-0000-000000000001';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const IL1 = 'dddddddd-0000-0000-0000-000000000001';
const IL2 = 'dddddddd-0000-0000-0000-000000000002';
const IL3 = 'dddddddd-0000-0000-0000-000000000003';
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const returnable = (id: string, n: number, code: string, name: string, unitCode: string, invoiced: number, returned: number) => ({
  purchaseInvoiceLineId: id, orderLineNumber: n, stockItemId: `st${n}`, stockCode: code, stockName: name, unitCode, invoicedQuantity: invoiced,
  returnedQuantity: returned, remainingQuantity: invoiced - returned, unitPrice: 250, discountPercent: 0, vatPercent: 20,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invoice = (id: string, code: string, extra: Record<string, unknown>) => ({
  id, code, purchaseReceiptId: 'r1', receiptCode: 'MK-0001', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0001', supplierId: 's1', supplierName: 'Ege Ambalaj',
  invoiceDate: '2026-11-05', dueDate: '2026-12-05', currencyCode: 'TRY', status: 'Posted', grandTotal: 1200, paidAmount: 0, outstandingAmount: 1200,
  displayOutstanding: 1200, overdueDays: 0, paymentState: 'Posted', lineCount: 1, createdAt: '2026-11-05', ...extra,
});
const rows = () => [
  invoice(I1, 'AF-0001', { paidAmount: 200, outstandingAmount: 1000, displayOutstanding: 1000, paymentState: 'Partial' }),
  invoice(I2, 'AF-0002', { dueDate: '2026-10-01', overdueDays: 21, paymentState: 'Overdue' }),
];
const detail = (id: string) => ({
  ...rows().find((row) => row.id === id), subtotal: 1000, discountTotal: 0, taxTotal: 200, accountingProfileCode: 'TR-LOCAL', providerInvoiceUuid: null,
  lines: [{ orderLineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 4, unitPrice: 250, discountAmount: 0, vatPercent: 20, taxAmount: 200, lineTotal: 1200 }],
  payments: id === I1 ? [{ id: PAY, code: 'OD-0001', paymentDate: '2026-11-06', paymentMethod: 'Cash', financialAccountName: 'Merkez kasa', reference: null, amount: 200, currencyCode: 'TRY', status: 'Posted' }] : [],
  returns: [],
});

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/purchasing/invoices') return page(rows());
    const one = /^\/api\/purchasing\/invoices\/([^/]+)$/.exec(path);
    if (one) return detail(one[1]);
    if (path === `/api/purchasing/invoices/${I2}/returnable-lines`) {
      return [returnable(IL1, 1, 'AMB-1', 'Koli 40x30', 'ADET', 4, 1), returnable(IL2, 2, 'AMB-2', 'Bant', 'ADET', 2, 2), returnable(IL3, 3, 'AMB-3', 'Streç', 'RULO', 5, 0)];
    }
    if (path === '/api/warehouses') return [{ id: W1, code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'rv' }];
    if (path === `/api/warehouses/${W1}/locations`) return [{ id: L1, warehouseId: W1, code: 'A-01', name: 'Raf 1', parentLocationId: null, isActive: true, rowVersion: 'rv' }];
    if (path === '/api/finance/accounts') return [{ id: 'fa1', code: 'K-1', name: 'Merkez kasa', type: 'Cash', currencyCode: 'TRY', isActive: true }];
  }
  if (method === 'POST') {
    if (path === `/api/purchasing/invoices/${I1}/payments`) return { id: 'p9', code: 'OD-0009' };
    if (path === `/api/purchasing/invoices/${I2}/returns`) return { id: 'ret9', code: 'AI-0009', purchaseInvoiceId: I2, status: 'Posted' };
    if (/^\/api\/purchasing\/(invoices|payments)\/[^/]+\/void$/.test(path)) return {};
  }
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchase-invoice-entry', 'sales-purchase-invoice-drafts']));
const openDocument = async () => {
  await h.select('AF-0001');
  await waitFor(() => expect(h.gets(`/api/purchasing/invoices/${I1}`).length).toBeGreaterThan(0), T);
  await h.ready('open');
  fireEvent.click(h.command('open'));
  return screen.findByRole('dialog', { name: /Alış faturası · AF-0001/ }, T);
};

describe('Alış faturaları standart tanımı', { timeout: 60000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('shows the derived payment state and remaining amount', async () => {
    h.setup(respond);
    await h.cell('AF-0001');
    expect(screen.getAllByText('Kısmen ödendi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vadesi geçti').length).toBeGreaterThan(0);
    expect(new URLSearchParams(h.gets('/api/purchasing/invoices')[0].url.split('?')[1]).get('supplierId')).toBeNull();
  });

  it('the supplierId page param filters the list', async () => {
    h.setup(respond, { params: { supplierId: '11111111-0000-0000-0000-000000000001' } });
    await h.cell('AF-0001');
    expect(new URLSearchParams(h.gets('/api/purchasing/invoices')[0].url.split('?')[1]).get('supplierId')).toBe('11111111-0000-0000-0000-000000000001');
  });

  it('Ödeme ekle posts the payment with an autoId requestId; a second payment gets a new one', async () => {
    h.setup(respond);
    await h.select('AF-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/invoices/${I1}`).length).toBeGreaterThan(0), T);
    const pay = async (amount: string, reference: string) => {
      fireEvent.click(await h.menuItem(/^Ödeme ekle/));
      const dialog = await screen.findByRole('dialog', { name: /Tedarikçi ödemesi · AF-0001/ }, T);
      fireEvent.change(document.getElementById('page-input-yontem')!, { target: { value: 'Card' } });
      fireEvent.change(document.getElementById('page-input-tutar')!, { target: { value: amount } });
      fireEvent.change(document.getElementById('page-input-referans')!, { target: { value: reference } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ödeme kaydet' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Tedarikçi ödemesi/ })).toBeNull(), T);
    };
    await pay('250', 'DK-1');
    const posts = () => h.writes().filter((call) => call.url === `/api/purchasing/invoices/${I1}/payments`);
    expect(posts()).toHaveLength(1);
    const body = h.bodyOf(posts()[0]);
    expect(body).toMatchObject({ amount: 250, paymentMethod: 'Card', reference: 'DK-1' });
    expect(String(body.requestId)).toMatch(UUID);
    expect(String(body.paymentDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await pay('100', 'DK-2');
    expect(posts()).toHaveLength(2);
    expect(h.bodyOf(posts()[1]).requestId).not.toBe(body.requestId);
  });

  it('a payment row of the document is cancelled after a confirm', async () => {
    h.setup(respond);
    const dialog = await openDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: /Ödemeler/ }));
    fireEvent.click(await within(dialog).findByText('OD-0001', { selector: 'td, td *' }, T));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ödemeyi iptal et' }, T));
    const confirm = await screen.findByRole('alertdialog', {}, T);
    expect(confirm.textContent).toContain('OD-0001 ödemesi iptal edilsin mi?');
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/payments/${PAY}/void` });
  });

  it('İptal et asks first and voids an unpaid invoice', async () => {
    h.setup(respond);
    await h.select('AF-0002');
    await waitFor(() => expect(h.gets(`/api/purchasing/invoices/${I2}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^İptal et \(ters kayıt\)/));
    expect((await screen.findByRole('alertdialog', {}, T)).textContent).toContain('AF-0002 alış faturası iptal edilsin mi?');
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/invoices/${I2}/void` });
  });

  it('İade oluştur fills the returnable lines; skipWhenZero and an edit shape the posted return with a requestId', async () => {
    h.setup(respond);
    await h.select('AF-0002');
    fireEvent.click(await h.menuItem(/^İade oluştur/));
    const dialog = await screen.findByRole('dialog', { name: /Alış iadesi · AF-0002 · Ege Ambalaj/ }, T);
    await waitFor(() => expect(h.gridCell('iadeKalemleri', 'dolu-1', 'quantity')?.value).toBe('3'), T);
    // Salt okunur fatura satırı seçimi metin olarak çizilir: kaynak sorgunun seçenek etiketi.
    expect(h.gridCell('iadeKalemleri', 'dolu-1', 'quantity')!.closest('tr')!.textContent).toContain('AMB-1');
    expect(h.gridCell('iadeKalemleri', 'dolu-2', 'quantity')!.value).toBe('0');
    expect(h.gridCell('iadeKalemleri', 'dolu-3', 'quantity')!.value).toBe('5');
    expect(await within(dialog).findByText(/Gönderilecek satır: 2\./, {}, T)).toBeTruthy();
    await h.pick(h.input('iadeDepo'), 'Ana depo');
    h.type(h.gridCell('iadeKalemleri', 'dolu-3', 'quantity')!, '1.5');
    await h.pick(h.gridCell('iadeKalemleri', 'dolu-1', 'storageLocationId')!, 'A-01');
    fireEvent.click(within(dialog).getByRole('button', { name: 'İadeyi kaydet' }));
    const url = `/api/purchasing/invoices/${I2}/returns`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(url)[0])).toEqual({
      requestId: expect.stringMatching(UUID), warehouseId: W1, returnDate: today(),
      lines: [
        { purchaseInvoiceLineId: IL1, quantity: 3, unitCode: 'ADET', storageLocationId: L1 },
        { purchaseInvoiceLineId: IL3, quantity: 1.5, unitCode: 'RULO' },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Alış iadesi · AF-0002/ })).toBeNull(), T);
  });

  it('Mal kabulsüz fatura opens the invoice drafts system page; Eski ekranda aç carries the invoice', async () => {
    h.setup(respond);
    await h.select('AF-0002');
    fireEvent.click(await h.menuItem(/^Mal kabulsüz fatura/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchase-invoice-drafts' });
    expect(h.state.navigations[0].legacy).toBeFalsy();
    fireEvent.click(await h.menuItem(/^Eski ekranda aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: KEY, params: { purchaseInvoiceId: I2 }, legacy: true });
  });
});
