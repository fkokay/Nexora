import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingOrdersOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Satınalma siparişleri" standart tanımı (sales-purchasing.json, v2): liste, sayfa parametresiyle açılan belge, mal kabul penceresi
// (siparişin kalanıyla doldurma, skipWhenZero, autoId requestId) ve eski ekran komutları.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchasing';
const P1 = '55555555-0000-0000-0000-000000000001';
const P2 = '55555555-0000-0000-0000-000000000002';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const RECEIPTS = `/api/purchasing/orders/${P1}/receipts`;
let receiptFailure: string | null = null;

const order = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, supplierId: 's1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', expectedReceiptDate: '2026-11-15', lineCount: 1,
  receivedPercent: 40, grandTotal: 1200, currencyCode: 'TRY', status, delayDays: 0, receivedQuantity: 4, orderedQuantity: 10, ...extra,
});
const rows = () => [order(P1, 'SA-0001', 'PartiallyReceived'), order(P2, 'SA-0002', 'Received', { receivedPercent: 100 })];
const line = (n: number, code: string, name: string, unitCode: string, quantity: number, received: number) => ({
  lineNumber: n, orderLineNumber: n, stockItemId: `st${n}`, stockCode: code, stockName: name, unitCode, quantity, receivedQuantity: received,
  remainingQuantity: quantity - received, unitPrice: 100, discountPercent: 0, vatPercent: 20, lineTotal: 1200, trackingMode: 'None',
});
const detail = (id: string) => ({
  ...rows().find((row) => row.id === id), subtotal: 1000, discountTotal: 0, taxTotal: 200, notes: 'Acil', postedReceiptCount: 1, invoicedReceiptCount: 0, customFields: [],
  targetWarehouseId: W1,
  // Satır 2 tam alınmış (kalan 0): skipWhenZero onu göndermez.
  lines: [line(1, 'AMB-1', 'Koli 40x30', 'ADET', 10, 4), line(2, 'AMB-2', 'Bant', 'ADET', 5, 5), line(3, 'AMB-3', 'Streç', 'RULO', 5, 0)],
  receipts: [{ id: 'r1', code: 'MK-0001', receiptDate: '2026-11-04', warehouseName: 'Ana depo', lineCount: 1, status: 'Posted', invoice: null }],
});

function respond(path: string, method: string): unknown {
  if (method === 'POST' && path === RECEIPTS) {
    if (receiptFailure) { const message = receiptFailure; receiptFailure = null; throw Object.assign(new Error(message), { status: 409, serverError: message }); }
    return { id: 'r2', code: 'MK-0002', purchaseOrderId: P1, purchaseOrderCode: 'SA-0001', warehouseId: W1, warehouseName: 'Ana depo', receiptDate: today(), status: 'Posted', lineCount: 2 };
  }
  if (method !== 'GET') return undefined;
  if (path === '/api/warehouses') return [{ id: W1, code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'rv' }];
  if (path === `/api/warehouses/${W1}/locations`) return [{ id: L1, warehouseId: W1, code: 'A-01', name: 'Raf 1', parentLocationId: null, isActive: true, rowVersion: 'rv' }];
  if (path === '/api/purchasing/orders') return page(rows());
  const one = /^\/api\/purchasing\/orders\/([^/]+)$/.exec(path);
  if (one) return detail(one[1]);
  if (/\/custom-fields$/.test(path)) return [];
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(() => { h.before(); receiptFailure = null; });
afterEach(() => h.after(['sales-purchase-receipts', 'sales-purchase-invoice-entry', 'sales-purchase-order-create']));

const openReceiptDialog = async () => {
  h.setup(respond, { params: { purchaseOrderId: P1 } });
  expect(await screen.findByText('SA-0001 · Ege Ambalaj', {}, T)).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Mal kabul oluştur' }, T));
  const dialog = await screen.findByRole('dialog', { name: /Mal kabul · SA-0001/ }, T);
  await waitFor(() => expect(h.gridCell('kabulKalemleri', 'dolu-1', 'quantity')?.value).toBe('6'), T);
  // Depo siparişin hedef deposuyla açılır.
  await waitFor(() => expect(h.input('kabulDepo').value).toBe('Ana depo'), T);
  return dialog;
};

describe('Satınalma siparişleri standart tanımı', { timeout: 60000 }, () => {
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

  it('Mal kabul oluştur opens the order in place; Yeni opens the new order system page', async () => {
    h.setup(respond);
    await h.select('SA-0001');
    fireEvent.click(await h.menuItem(/^Mal kabul oluştur/));
    expect(await screen.findByText('SA-0001 · Ege Ambalaj', {}, T)).toBeTruthy();
    expect(h.state.navigations).toEqual([]);
    await h.ready('new');
    fireEvent.click(h.command('new'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchase-order-create' });
    expect(h.state.navigations[0].legacy).toBeFalsy();
  });

  it('receipt dialog fills the remaining quantities; an edit and skipWhenZero shape the posted lines with a requestId', async () => {
    const dialog = await openReceiptDialog();
    // Kalan miktarla dolar: 6, 0 (tam alınmış), 5; sipariş miktarı `orderedQuantity` sütununda.
    expect(h.gridCell('kabulKalemleri', 'dolu-1', 'orderedQuantity')!.value).toBe('10');
    expect(h.gridCell('kabulKalemleri', 'dolu-2', 'quantity')!.value).toBe('0');
    expect(h.gridCell('kabulKalemleri', 'dolu-3', 'quantity')!.value).toBe('5');
    expect(h.gridCell('kabulKalemleri', 'dolu-1', 'trackingMode')!.value).toBe('None');
    expect(await within(dialog).findByText(/Gönderilecek satır: 2/, {}, T)).toBeTruthy();
    h.type(h.gridCell('kabulKalemleri', 'dolu-3', 'quantity')!, '2');
    await h.pick(h.gridCell('kabulKalemleri', 'dolu-3', 'storageLocationId')!, 'A-01');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mal kabulü kaydet' }));
    await waitFor(() => expect(h.sent(RECEIPTS)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(RECEIPTS)[0])).toEqual({
      requestId: expect.stringMatching(GUID), warehouseId: W1, receiptDate: today(),
      lines: [
        // Fiyatlar sipariş satırından dolar (aynı kodlu sütunlar) ve olduğu gibi gönderilir.
        { orderLineNumber: 1, quantity: 6, unitCode: 'ADET', unitPrice: 100, discountPercent: 0, vatPercent: 20 },
        { orderLineNumber: 3, quantity: 2, unitCode: 'RULO', storageLocationId: L1, unitPrice: 100, discountPercent: 0, vatPercent: 20 },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Mal kabul · SA-0001/ })).toBeNull(), T);
  });

  it('a free (Bedelsiz) line locks and clears its price cells and sends no price; a priced line sends the overridden price', async () => {
    const dialog = await openReceiptDialog();
    // Sipariş fiyatı ve formül Tutar: 6 × 100 = 600.
    expect(h.gridCell('kabulKalemleri', 'dolu-1', 'unitPrice')!.value).toBe('100');
    expect(h.gridCell('kabulKalemleri', 'dolu-1', 'vatPercent')!.value).toBe('20');
    expect(h.gridCell('kabulKalemleri', 'dolu-1', 'lineNetAmount')!.value).toBe('600');
    // Satır 1 bedelsiz: fiyat, iskonto, KDV ve Tutar hücreleri salt okunur "—" olur.
    fireEvent.click(h.gridCell('kabulKalemleri', 'dolu-1', 'isFreeOfCharge')!);
    await waitFor(() => expect(h.gridCell('kabulKalemleri', 'dolu-1', 'unitPrice')).toBeNull(), T);
    const lockedCells = dialog.querySelectorAll('[data-locked]');
    expect([...lockedCells].map((cell) => cell.getAttribute('data-locked'))).toEqual(['unitPrice', 'discountPercent', 'vatPercent', 'lineNetAmount']);
    expect([...lockedCells].every((cell) => cell.textContent === '—')).toBe(true);
    // Bedelsiz kaldırılınca siparişin fiyatı geri gelir; yeniden işaretlenir.
    fireEvent.click(h.gridCell('kabulKalemleri', 'dolu-1', 'isFreeOfCharge')!);
    await waitFor(() => expect(h.gridCell('kabulKalemleri', 'dolu-1', 'unitPrice')?.value).toBe('100'), T);
    expect(h.gridCell('kabulKalemleri', 'dolu-1', 'lineNetAmount')!.value).toBe('600');
    fireEvent.click(h.gridCell('kabulKalemleri', 'dolu-1', 'isFreeOfCharge')!);
    await waitFor(() => expect(h.gridCell('kabulKalemleri', 'dolu-1', 'unitPrice')).toBeNull(), T);
    // Satır 3 fiyatlı: kullanıcının yazdığı fiyat ve iskonto gönderilir; Tutar 5 × 80 × 0,9 = 360.
    h.type(h.gridCell('kabulKalemleri', 'dolu-3', 'unitPrice')!, '80');
    h.type(h.gridCell('kabulKalemleri', 'dolu-3', 'discountPercent')!, '10');
    await waitFor(() => expect(h.gridCell('kabulKalemleri', 'dolu-3', 'lineNetAmount')!.value).toBe('360'), T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mal kabulü kaydet' }));
    await waitFor(() => expect(h.sent(RECEIPTS)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(RECEIPTS)[0])).toEqual({
      requestId: expect.stringMatching(GUID), warehouseId: W1, receiptDate: today(),
      lines: [
        { orderLineNumber: 1, quantity: 6, unitCode: 'ADET', isFreeOfCharge: true },
        { orderLineNumber: 3, quantity: 5, unitCode: 'RULO', unitPrice: 80, discountPercent: 10, vatPercent: 20 },
      ],
    });
  });

  it('a failed receipt keeps the dialog, shows the server text and retries with the same requestId', async () => {
    const dialog = await openReceiptDialog();
    receiptFailure = 'Sipariş satırında fazla teslim.';
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mal kabulü kaydet' }));
    expect(await within(dialog).findByText(/Sipariş satırında fazla teslim\./, {}, T)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mal kabulü kaydet' }));
    await waitFor(() => expect(h.sent(RECEIPTS)).toHaveLength(2), T);
    const [first, second] = h.sent(RECEIPTS).map((call) => h.bodyOf(call).requestId);
    expect(first).toMatch(GUID);
    expect(second).toBe(first);
  });

  it('Lot/seri izlemeli kabul opens the legacy order screen with the order', async () => {
    const dialog = await openReceiptDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lot/seri izlemeli kabul (eski ekran)' }));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { purchaseOrderId: P1 }, legacy: true });
  });

  it('Siparişi eski ekranda aç carries the selected order', async () => {
    h.setup(respond);
    await h.select('SA-0002');
    fireEvent.click(await h.menuItem(/^Siparişi eski ekranda aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { purchaseOrderId: P2 }, legacy: true });
  });
});
