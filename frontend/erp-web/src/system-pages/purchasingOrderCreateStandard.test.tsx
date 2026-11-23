import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingOrderCreateOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Yeni satınalma siparişi" standart tanımı (sales-purchase-order-create.json): başlık, stok seçimiyle dolan satırlar (lookupFills),
// zincirli formüller, toplamlar, kayıt gövdesi ve kayıttan sonra siparişin açılması.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-order-create';
const SUP = '77777777-0000-0000-0000-000000000001';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const PO = '55555555-0000-0000-0000-000000000009';
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const supplier = { id: SUP, code: '320.01', name: 'Ege Ambalaj', type: 'Supplier', isActive: true, currencyCode: 'EUR', paymentTermDays: 30 };
const card = (id: string, code: string, name: string, price: number, discount: number, vat: number) => ({
  id, code, name, unitCode: 'ADET', isActive: true, trackingMode: 'None', purchaseListPrice: price, purchaseDiscountPercent: discount, purchaseVatPercent: vat,
});
const cards = [card(S1, 'AMB-1', 'Koli 40x30', 12.5, 10, 20), card(S2, 'AMB-2', 'Bant', 3.33, 0, 18)];
let createFailure: string | null = null;

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/customers') return page([supplier]);
    if (path === '/api/warehouses') return [{ id: W1, code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'rv' }];
    if (path === '/api/stock/items') return page(cards);
    const unit = /^\/api\/stock\/items\/([^/]+)\/units$/.exec(path);
    if (unit) return { baseUnitCode: 'ADET', conversions: [{ id: 'u1', unitCode: 'KOLI', factorToBase: 12, isActive: true }] };
  }
  if (method === 'POST' && path === '/api/purchasing/orders') {
    if (createFailure) { const message = createFailure; createFailure = null; throw Object.assign(new Error(message), { status: 409, serverError: message }); }
    return { id: PO, code: 'PO-2026-001', supplierId: SUP, supplierName: 'Ege Ambalaj', orderDate: today(), currencyCode: 'EUR', status: 'Open', grandTotal: 0, lineCount: 2 };
  }
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(() => { h.before(); createFailure = null; });
afterEach(() => h.after(['sales-purchasing']));

const fillHeader = async () => {
  await h.pick(h.input('tedarikci'), 'Ege Ambalaj');
  await waitFor(() => expect(h.input('doviz').value).toBe('EUR'), T);
  h.type(h.input('siparisNo'), 'po-2026-001');
  h.type(h.input('teslimTarihi'), '2026-12-01');
  await h.pick(h.input('depo'), 'Ana depo');
  h.type(h.input('siparisNotu'), 'Acil');
};
const addLine = async (stock: string, quantity: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
  const rows = document.querySelectorAll('[id^="page-grid-kalemler-yeni-"][id$="-stockItemId"]');
  const key = /page-grid-kalemler-(yeni-\d+)-stockItemId/.exec(rows[rows.length - 1].id)![1];
  await h.pick(h.gridCell('kalemler', key, 'stockItemId')!, stock);
  await waitFor(() => expect(h.gridCell('kalemler', key, 'unitPrice')!.value).not.toBe(''), T);
  h.type(h.gridCell('kalemler', key, 'quantity')!, quantity);
  return key;
};

describe('Yeni satınalma siparişi standart tanımı', { timeout: 60000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('stock pick fills price, discount, VAT and unit; chained formulas and totals; save body; then opens the order', async () => {
    h.setup(respond);
    await h.ready('save');
    await fillHeader();
    const first = await addLine('AMB-1', '3');
    // lookupFills: kartın alış fiyatı, alış iskontosu, alış KDV'si ve birimi.
    expect(h.gridCell('kalemler', first, 'unitPrice')!.value).toBe('12.5');
    expect(h.gridCell('kalemler', first, 'discountPercent')!.value).toBe('10');
    expect(h.gridCell('kalemler', first, 'vatPercent')!.value).toBe('20');
    // 3 × 12.5 = 37.5; −10 % = 33.75 net; KDV 6.75; toplam 40.5.
    await waitFor(() => expect(h.gridCell('kalemler', first, 'lineNet')!.value).toBe('33.75'), T);
    expect(h.gridCell('kalemler', first, 'lineNet')!.readOnly).toBe(true);
    expect(h.gridCell('kalemler', first, 'lineVat')!.value).toBe('6.75');
    expect(h.gridCell('kalemler', first, 'lineTotal')!.value).toBe('40.5');
    const second = await addLine('AMB-2', '7');
    // 7 × 3.33 = 23.31 net; KDV %18 = 4.1958 → 4.2; toplam 27.51 (yuvarlanmış parçalardan).
    await waitFor(() => expect(h.gridCell('kalemler', second, 'lineVat')!.value).toBe('4.2'), T);
    expect(h.gridCell('kalemler', second, 'lineTotal')!.value).toBe('27.51');
    expect(await screen.findByText(/Satır: 2 · Net: 57\.06 · KDV: 10\.95 · Genel toplam: 68\.01 EUR/, {}, T)).toBeTruthy();

    fireEvent.click(h.command('save'));
    await waitFor(() => expect(h.sent('/api/purchasing/orders')).toHaveLength(1), T);
    expect(h.bodyOf(h.sent('/api/purchasing/orders')[0])).toEqual({
      code: 'PO-2026-001', supplierId: SUP, orderDate: today(), currencyCode: 'EUR', notes: 'Acil', expectedReceiptDate: '2026-12-01', targetWarehouseId: W1,
      lines: [
        { stockItemId: S1, quantity: 3, unitPrice: 12.5, discountPercent: 10, vatPercent: 20, unitCode: 'ADET' },
        { stockItemId: S2, quantity: 7, unitPrice: 3.33, discountPercent: 0, vatPercent: 18, unitCode: 'ADET' },
      ],
    });
    // afterSaveButton: kayıttan sonra sipariş sayfası açılır.
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchasing' });
  });

  // afterSaveButton gezinmesi kaydın sonucunu (`{{olustur.sonuc.id}}`) görür: yazma sonucu güncel kapsama hemen bindirilir.
  it('afterSaveButton opens the new order with olustur.sonuc.id', async () => {
    h.setup(respond);
    await h.ready('save');
    await fillHeader();
    await addLine('AMB-1', '1');
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchasing', params: { purchaseOrderId: PO } });
  });

  it('an edited price is sent as typed; a 409 shows the server text and nothing navigates', async () => {
    h.setup(respond);
    await h.ready('save');
    await fillHeader();
    const line = await addLine('AMB-1', '2');
    h.type(h.gridCell('kalemler', line, 'unitPrice')!, '11');
    h.type(h.gridCell('kalemler', line, 'discountPercent')!, '');
    await waitFor(() => expect(h.gridCell('kalemler', line, 'lineTotal')!.value).toBe('26.4'), T);
    createFailure = 'Sipariş no zaten kullanılıyor.';
    fireEvent.click(h.command('save'));
    expect(await screen.findByText(/Sipariş no zaten kullanılıyor\./, {}, T)).toBeTruthy();
    const body = h.bodyOf(h.sent('/api/purchasing/orders')[0]) as { lines: Record<string, unknown>[] };
    expect(body.lines).toEqual([{ stockItemId: S1, quantity: 2, unitPrice: 11, vatPercent: 20, unitCode: 'ADET' }]);
    expect(h.state.navigations).toEqual([]);
  });

  it('a missing supplier or line blocks the save; Sipariş listesi opens the order list', async () => {
    h.setup(respond);
    await h.ready('save');
    fireEvent.click(h.command('save'));
    await h.settle(200);
    expect(h.writes()).toEqual([]);
    fireEvent.click(await h.menuItem(/^Sipariş listesi/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchasing' });
  });
});
