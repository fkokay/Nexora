import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageParams } from '../pageNavigation';
import catalog from './purchasingInvoicesOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Alış faturaları" standart tanımı (sales-purchase-invoices.json, v3, Liste kalıbı): ödeme durumu, supplierId süzgeci, ödeme penceresi
// (autoId requestId), ödeme iptali, fatura iptali; iade oluşturma İade ekranına gezinmedir (pencere satır tablosu gelince pencereye döner).

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-purchase-invoices';
const I1 = '88888888-0000-0000-0000-000000000001';
const I2 = '88888888-0000-0000-0000-000000000002';
const PAY = '99999999-0000-0000-0000-000000000001';
const bodyOf = (call: { body?: string }) => JSON.parse(call.body ?? 'null') as Record<string, unknown>;
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

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
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
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); h.listen(); });
afterEach(() => { h.reset(); cleanup(); setPageParams(KEY, {}); });

describe('Alış faturaları standart tanımı', { timeout: 60000 }, () => {
  it('is a v4 preview Liste standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 4, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect((h.standard.definition as unknown as { template: unknown }).template).toEqual({ name: 'list' });
  });

  it('shows the derived payment state and remaining amount', async () => {
    h.setup();
    await screen.findByText('AF-0001', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    expect(screen.getAllByText('Kısmen ödendi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vadesi geçti').length).toBeGreaterThan(0);
    expect(query(h.gets('/api/purchasing/invoices')[0].url).get('supplierId')).toBeNull();
  });

  it('the supplierId page param filters the list', async () => {
    setPageParams(KEY, { supplierId: '11111111-0000-0000-0000-000000000001' });
    h.setup();
    await screen.findByText('AF-0001', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T);
    expect(query(h.gets('/api/purchasing/invoices')[0].url).get('supplierId')).toBe('11111111-0000-0000-0000-000000000001');
  });

  it('Ödeme ekle posts the payment with an autoId requestId; a second payment gets a new one', async () => {
    h.setup();
    await h.selectRow('AF-0001');
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
    const body = bodyOf(posts()[0]);
    expect(body).toMatchObject({ amount: 250, paymentMethod: 'Card', reference: 'DK-1' });
    expect(String(body.requestId)).toMatch(UUID);
    expect(String(body.paymentDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await pay('100', 'DK-2');
    expect(posts()).toHaveLength(2);
    expect(bodyOf(posts()[1]).requestId).not.toBe(body.requestId);
  });

  it('İptal et asks first and voids an unpaid invoice', async () => {
    h.setup();
    await h.selectRow('AF-0002');
    await waitFor(() => expect(h.gets(`/api/purchasing/invoices/${I2}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^İptal et \(ters kayıt\)/));
    await h.confirm('AF-0002 alış faturası iptal edilsin mi?');
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/invoices/${I2}/void` });
  });

  it('Mal kabulsüz fatura opens the drafts system page, İade oluştur the returns page; no Eski ekranda aç', async () => {
    h.setup();
    await h.selectRow('AF-0002');
    await waitFor(() => expect(h.gets(`/api/purchasing/invoices/${I2}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^Mal kabulsüz fatura/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchase-invoice-drafts' });
    expect(h.state.navigations[0].legacy).toBeFalsy();
    fireEvent.click(await h.menuItem(/^İade oluştur/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'sales-purchase-returns' });
    expect(h.state.navigations[1].legacy).toBeFalsy();
    expect(h.menuItems().some((item) => /Eski ekran/.test(item))).toBe(false);
  });
});
