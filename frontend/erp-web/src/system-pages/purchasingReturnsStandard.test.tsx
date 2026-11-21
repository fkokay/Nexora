import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingReturnsOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Alış iadeleri" standart tanımı (sales-purchase-returns.json): liste, belge penceresi, onaylı iptal ve eski ekrana geçiş.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-returns';
const S1 = 'aaaaaaaa-1111-0000-0000-000000000001';
const S2 = 'aaaaaaaa-1111-0000-0000-000000000002';
const INV = '88888888-0000-0000-0000-000000000001';
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
  if (method === 'POST' && /^\/api\/purchasing\/returns\/[^/]+\/void$/.test(path)) return {};
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchase-invoices']));

describe('Alış iadeleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the returns and opens the read-only document with its lines', async () => {
    h.setup(respond);
    await h.select('AI-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/returns/${S1}`).length).toBeGreaterThan(0), T);
    await h.ready('open');
    fireEvent.click(h.command('open'));
    const dialog = await screen.findByRole('dialog', { name: /Alış iadesi · AI-0001/ }, T);
    expect(await within(dialog).findByText('Koli 40x30', { selector: 'td, td *' }, T)).toBeTruthy();
    expect(h.writes()).toEqual([]);
  });

  it('İadeyi iptal et asks first and voids the selected return', async () => {
    h.setup(respond);
    await h.select('AI-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/returns/${S1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^İadeyi iptal et/));
    expect((await screen.findByRole('alertdialog', {}, T)).textContent).toContain('AI-0001 alış iadesi iptal edilsin mi?');
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/returns/${S1}/void` });
  });

  it('Faturayı aç opens the legacy invoice screen with purchaseInvoiceId', async () => {
    h.setup(respond);
    await h.select('AI-0002');
    fireEvent.click(await h.menuItem(/^Faturayı aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchase-invoices', params: { purchaseInvoiceId: INV }, legacy: true });
  });
});
