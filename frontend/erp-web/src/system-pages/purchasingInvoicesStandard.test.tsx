import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingInvoicesOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Alış faturaları" standart tanımı (sales-purchase-invoices.json): ödeme durumu, supplierId süzgeci, ödeme penceresi
// (autoId requestId), ödeme iptali ve fatura iptali.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-invoices';
const I1 = '88888888-0000-0000-0000-000000000001';
const I2 = '88888888-0000-0000-0000-000000000002';
const PAY = '99999999-0000-0000-0000-000000000001';
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
    if (path === '/api/finance/accounts') return [{ id: 'fa1', code: 'K-1', name: 'Merkez kasa', type: 'Cash', currencyCode: 'TRY', isActive: true }];
  }
  if (method === 'POST') {
    if (path === `/api/purchasing/invoices/${I1}/payments`) return { id: 'p9', code: 'OD-0009' };
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

describe('Alış faturaları standart tanımı', { timeout: 30000 }, () => {
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

  it('İptal et asks first and voids an unpaid invoice; İade oluştur opens the legacy screen', async () => {
    h.setup(respond);
    await h.select('AF-0002');
    await waitFor(() => expect(h.gets(`/api/purchasing/invoices/${I2}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^İptal et \(ters kayıt\)/));
    expect((await screen.findByRole('alertdialog', {}, T)).textContent).toContain('AF-0002 alış faturası iptal edilsin mi?');
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/invoices/${I2}/void` });
    fireEvent.click(await h.menuItem(/^İade oluştur/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { purchaseInvoiceId: I2 }, legacy: true });
  });
});
