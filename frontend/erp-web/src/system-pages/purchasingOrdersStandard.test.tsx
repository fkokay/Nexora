import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingOrdersOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Satınalma siparişleri" standart tanımı (sales-purchasing.json): liste, sayfa parametresiyle açılan belge ve eski ekran komutları.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchasing';
const P1 = '55555555-0000-0000-0000-000000000001';
const P2 = '55555555-0000-0000-0000-000000000002';
const order = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, supplierId: 's1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', expectedReceiptDate: '2026-11-15', lineCount: 1,
  receivedPercent: 40, grandTotal: 1200, currencyCode: 'TRY', status, delayDays: 0, receivedQuantity: 4, orderedQuantity: 10, ...extra,
});
const rows = () => [order(P1, 'SA-0001', 'PartiallyReceived'), order(P2, 'SA-0002', 'Received', { receivedPercent: 100 })];
const detail = (id: string) => ({
  ...rows().find((row) => row.id === id), subtotal: 1000, discountTotal: 0, taxTotal: 200, notes: 'Acil', postedReceiptCount: 1, invoicedReceiptCount: 0, customFields: [],
  lines: [{ lineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', quantity: 10, receivedQuantity: 4, remainingQuantity: 6, unitPrice: 100, discountPercent: 0, vatPercent: 20, lineTotal: 1200 }],
  receipts: [{ id: 'r1', code: 'MK-0001', receiptDate: '2026-11-04', warehouseName: 'Ana depo', lineCount: 1, status: 'Posted', invoice: null }],
});

function respond(path: string, method: string): unknown {
  if (method !== 'GET') return undefined;
  if (path === '/api/purchasing/orders') return page(rows());
  const one = /^\/api\/purchasing\/orders\/([^/]+)$/.exec(path);
  if (one) return detail(one[1]);
  if (/\/custom-fields$/.test(path)) return [];
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchase-receipts', 'sales-purchase-invoice-entry']));

describe('Satınalma siparişleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the orders with status labels and loads no document', async () => {
    h.setup(respond);
    await h.cell('SA-0001');
    expect(screen.getAllByText('Kısmen alındı').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tam alındı').length).toBeGreaterThan(0);
    const overdue = h.gets('/api/purchasing/orders').map((call) => new URLSearchParams(call.url.split('?')[1] ?? '').get('overdue'));
    expect(overdue).toContain('true');
    expect(h.gets(`/api/purchasing/orders/${P1}`)).toEqual([]);
  });

  it('opens the read-only document from the purchaseOrderId page param', async () => {
    h.setup(respond, { params: { purchaseOrderId: P1 } });
    expect(await screen.findByText('SA-0001 · Ege Ambalaj', {}, T)).toBeTruthy();
    expect(await screen.findByText('Koli 40x30', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' }, T)).toBeTruthy();
    expect(h.gets(`/api/purchasing/orders/${P1}`).length).toBeGreaterThan(0);
    expect(screen.queryByText('SA-0002', { selector: '.tenant-page-data-grid td, .tenant-page-data-grid td *' })).toBeNull();
    expect(h.writes()).toEqual([]);
  });

  it('a row double-click (Aç) opens the document of the order in place', async () => {
    h.setup(respond);
    fireEvent.doubleClick(await h.cell('SA-0001'));
    expect(await screen.findByText('SA-0001 · Ege Ambalaj', {}, T)).toBeTruthy();
    expect(h.state.navigations).toEqual([]);
  });

  it('Mal kabul oluştur and Yeni open the legacy order screen (legacy: true)', async () => {
    h.setup(respond);
    await h.select('SA-0001');
    fireEvent.click(await h.menuItem(/^Mal kabul oluştur/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { purchaseOrderId: P1 }, legacy: true });
    await h.ready('new');
    fireEvent.click(h.command('new'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: KEY, params: {}, legacy: true });
  });

  it('Siparişi eski ekranda aç carries the selected order', async () => {
    h.setup(respond);
    await h.select('SA-0002');
    fireEvent.click(await h.menuItem(/^Siparişi eski ekranda aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { purchaseOrderId: P2 }, legacy: true });
  });
});
