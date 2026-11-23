import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageParams } from '../pageNavigation';
import catalog from './salesOrderCreateOperations.fixture.json';
import { T, page, salesHarness } from './salesStandardHarness';

// "Satış siparişi" kartı (sales-order-create.json: yeni ve `orderId` ile düzenleme) gerçek çalışma zamanıyla çizilir.
// `salesOrderCreateOperations.fixture.json` ErpOperationCatalog'un bu kartın kullandığı işlemlerinin anlık görüntüsüdür.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-order-create';
const O1 = '55555555-0000-0000-0000-000000000001';
const C1 = '22222222-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const S9 = '11111111-0000-0000-0000-000000000009';
const P1 = '66666666-0000-0000-0000-000000000001';

type Body = Record<string, unknown> & { lines?: Record<string, unknown>[] };
let status = 'Open';

const orderLine = (lineNumber: number, stockItemId: string, stockCode: string, stockName: string, extra: Record<string, unknown>) => ({
  lineNumber, stockItemId, stockCode, stockName, unitCode: 'ADET', quantity: 2, unitPrice: 10, enteredUnitPrice: 10, enteredUnitCode: 'ADET',
  enteredCurrencyCode: 'TRY', discountPercent: 0, vatPercent: 20, isVatIncluded: false, deliveredQuantity: 0, remainingQuantity: 2, lineTotal: 24, ...extra,
});
const order = () => ({
  id: O1, code: 'SIP-7', customerId: C1, customerName: 'Acme', orderDate: '2026-11-01', requestedDeliveryDate: '2026-11-20', currencyCode: 'TRY',
  salespersonEmployeeId: P1, status, grandTotal: 48,
  lines: [orderLine(1, S1, 'STK-1', 'Koli', {}), orderLine(2, S9, 'STK-9', 'Palet', { quantity: 1, enteredUnitPrice: 5, enteredCurrencyCode: 'USD', unitPrice: 170 })],
});

function preview(body: Body) {
  const lines = (body.lines ?? []).map((line) => {
    const subtotal = Number(line.quantity) * Number(line.unitPrice);
    const tax = subtotal * Number(line.vatPercent ?? 0) / 100;
    return { rowKey: line.rowKey, lineSubtotal: subtotal, discountAmount: 0, taxAmount: tax, lineTotal: subtotal + tax };
  });
  const sum = (field: 'lineSubtotal' | 'taxAmount' | 'lineTotal') => lines.reduce((total, line) => total + line[field], 0);
  return { currencyCode: 'TRY', lineCount: lines.length, subtotal: sum('lineSubtotal'), discountTotal: 0, taxableTotal: sum('lineSubtotal'), taxTotal: sum('taxAmount'),
    grossTotal: sum('lineTotal'), withholdingTotal: 0, grandTotal: sum('lineTotal'), lines: [...lines].reverse(), taxes: [] };
}

function respond(url: string, method: string, body?: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === `/api/sales/orders/${O1}`) return order();
    if (path === `/api/sales/orders/${O1}/custom-fields`) return [];
    if (path === '/api/sales/orders/custom-fields') return [];
    if (path === '/api/customers') return page([{ id: C1, code: 'C-1', name: 'Acme', type: 'Customer', isActive: true, currencyCode: 'TRY' }]);
    if (path === `/api/customers/${C1}`) return { id: C1, code: 'C-1', name: 'Acme', type: 'Customer', isActive: true, currencyCode: 'TRY' };
    // S9 (yüklenen ikinci satırın stoku) seçeneklerin ilk sayfasında yok.
    if (path === '/api/stock/items') {
      return page([
        { id: S1, code: 'STK-1', name: 'Koli', isActive: true, unitCode: 'ADET', salesListPrice: 100, salesVatPercent: 20, salesDiscountPercent: 0, priceCurrencyCode: 'TRY' },
        { id: S2, code: 'STK-2', name: 'Bant', isActive: true, unitCode: 'RULO', salesListPrice: 5, salesVatPercent: 10, salesDiscountPercent: 5, priceCurrencyCode: 'EUR' },
      ]);
    }
    if (/^\/api\/stock\/items\/[^/]+\/units$/.test(path)) return { conversions: [{ unitCode: 'KOLI', isActive: true, factorToBase: 10 }] };
    if (path === '/api/hr/employees') return page([{ id: P1, fullName: 'Ayşe Plasiyer', personnelCode: 'P-1', status: 'Active' }]);
  } else if (method === 'POST') {
    if (path === '/api/sales/orders/preview') return preview(JSON.parse(body!) as Body);
    if (path === '/api/sales/orders') return { id: 'new', code: 'SIP-8', status: 'Open' };
  } else if (method === 'PUT') {
    if (path === `/api/sales/orders/${O1}`) return { id: O1, code: 'SIP-7', status: 'Open' };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); status = 'Open'; h.listen(); });
afterEach(() => { h.reset(); cleanup(); setPageParams(KEY, {}); });

const calls = (method: string, path: string) => h.state.calls.filter((call) => call.method === method && call.url.split('?')[0] === path);
const cell = (key: string, code: string) => document.getElementById(`page-grid-kalemler-${key}-${code}`) as HTMLInputElement;
const input = (id: string) => document.getElementById(`page-input-${id}`) as HTMLInputElement;
const calc = (label: string, row: number) => screen.getByLabelText(`${label} (satır ${row})`).textContent;
const pick = async (element: HTMLElement, option: RegExp) => {
  fireEvent.click(element);
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};

describe('Satış siparişi standart kartı', { timeout: 40000 }, () => {
  it('is a v1 preview standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 1, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('orderId opens the order for edit: header and editable lines load, preview by row key, Kaydet PUTs the full line list', async () => {
    setPageParams(KEY, { orderId: O1, customerId: C1, orderDate: '2026-11-01' });
    h.setup();
    await waitFor(() => expect(cell('kaynak-2', 'unitPrice')?.value).toBe('5'), T);
    expect(input('siparisNo').value).toBe('SIP-7');
    expect(input('siparisTarihi').value).toBe('2026-11-01');
    expect(input('teslimTarihi').value).toBe('2026-11-20');
    expect(cell('kaynak-1', 'quantity').value).toBe('2');
    expect(cell('kaynak-2', 'currencyCode').value).toBe('USD');
    // Yüklenen stok hücresi `stockItemId@label=stockCode` ile seçicinin etiket sütunu (kod) olarak görünür.
    expect((screen.getByLabelText('Stok (satır 1)') as HTMLInputElement).value).toContain('STK-1');
    await waitFor(() => expect(calc('Tutar', 1)).toBe('24,00'), T);
    expect(calc('Tutar', 2)).toBe('6,00');
    const sent = JSON.parse(calls('POST', '/api/sales/orders/preview').at(-1)!.body!) as Body;
    expect(sent.lines!.map((line) => line.rowKey)).toEqual(['kaynak-1', 'kaynak-2']);

    fireEvent.change(cell('kaynak-1', 'quantity'), { target: { value: '3' } });
    await waitFor(() => expect(calc('Tutar', 1)).toBe('36,00'), T);
    // Toplamlar önizleme kaydından (meta): 36 + 6.
    await waitFor(() => expect(screen.getByText('Genel toplam').closest('article')!.textContent).toContain('42,00'), T);
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(calls('PUT', `/api/sales/orders/${O1}`)).toHaveLength(1), T);
    expect(calls('POST', '/api/sales/orders')).toHaveLength(0);
    const body = JSON.parse(calls('PUT', `/api/sales/orders/${O1}`)[0].body!) as Body;
    expect(body).toMatchObject({ code: 'SIP-7', customerId: C1, orderDate: '2026-11-01', requestedDeliveryDate: '2026-11-20', currencyCode: 'TRY', salespersonEmployeeId: P1 });
    expect(body.lines).toEqual([
      { stockItemId: S1, quantity: 3, unitCode: 'ADET', unitPrice: 10, currencyCode: 'TRY', discountPercent: 0, vatPercent: 20, isVatIncluded: false },
      { stockItemId: S9, quantity: 1, unitCode: 'ADET', unitPrice: 5, currencyCode: 'USD', discountPercent: 0, vatPercent: 20, isVatIncluded: false },
    ]);
  });

  it('a loaded line whose stock is not on the option page shows its code, not the raw id', async () => {
    setPageParams(KEY, { orderId: O1, customerId: C1, orderDate: '2026-11-01' });
    h.setup();
    await waitFor(() => expect(cell('kaynak-2', 'unitPrice')?.value).toBe('5'), T);
    await waitFor(() => expect(h.gets('/api/stock/items').length).toBeGreaterThan(0), T);
    // `initialRowsMap` @label eşlemi: seçenek sayfasında olmayan stok da kodla görünür (ham kimlik değil).
    expect((screen.getByLabelText('Stok (satır 2)') as HTMLInputElement).value).toBe('STK-9');
  });

  it('a new order takes customer and date from the page params; a stock choice fills price, currency, discount and VAT', async () => {
    setPageParams(KEY, { customerId: C1, orderDate: '2026-11-22' });
    h.setup();
    expect(await screen.findByText('Yeni satış siparişi', {}, T)).toBeTruthy();
    await waitFor(() => expect(input('siparisTarihi').value).toBe('2026-11-22'), T);
    await waitFor(() => expect(h.gets('/api/stock/items').length).toBeGreaterThan(0), T);
    await waitFor(() => expect(screen.getByText('Henüz satır yok.')).toBeTruthy(), T);
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    await waitFor(() => expect(cell('yeni-1', 'stockItemId')).toBeTruthy(), T);
    await pick(cell('yeni-1', 'stockItemId'), /^STK-2/);
    await waitFor(() => expect(cell('yeni-1', 'unitPrice').value).toBe('5'), T);
    expect(cell('yeni-1', 'currencyCode').value).toBe('EUR');
    expect(cell('yeni-1', 'discountPercent').value).toBe('5');
    expect(cell('yeni-1', 'vatPercent').value).toBe('10');
    fireEvent.change(cell('yeni-1', 'quantity'), { target: { value: '4' } });
    await waitFor(() => expect(calc('Tutar', 1)).toBe('22,00'), T);
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(calls('POST', '/api/sales/orders')).toHaveLength(1), T);
    const body = JSON.parse(calls('POST', '/api/sales/orders')[0].body!) as Body;
    expect(body).toMatchObject({ customerId: C1, orderDate: '2026-11-22', currencyCode: 'TRY' });
    expect(body.lines).toEqual([{ stockItemId: S2, quantity: 4, unitPrice: 5, currencyCode: 'EUR', discountPercent: 5, vatPercent: 10 }]);
    await waitFor(() => expect(h.state.navigations.some((item) => item.page === 'sales-orders')).toBe(true), T);
  });

  it('an order that is not open shows the warning and offers no save', async () => {
    status = 'Delivered';
    setPageParams(KEY, { orderId: O1, customerId: C1, orderDate: '2026-11-01' });
    h.setup();
    expect(await screen.findByText('Bu sipariş düzenlenemez', {}, T)).toBeTruthy();
    await waitFor(() => expect(h.command('save') === null || h.command('save').getAttribute('aria-disabled') === 'true'
      || h.command('save').hidden).toBe(true), T);
  });
});
