import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPageParams } from '../pageNavigation';
import catalog from './salesInvoiceCreateOperations.fixture.json';
import { T, page, salesHarness } from './salesStandardHarness';

// "Yeni satış faturası" kartı (sales-invoice-create.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// `salesInvoiceCreateOperations.fixture.json` ErpOperationCatalog'un bu kartın kullandığı işlemlerinin anlık görüntüsüdür.
// Tutarlar sunucu önizlemesinden gelir (satis.fatura.onizle / onizleVergileri); sayfa formül tekrarlamaz.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-invoice-create';
const C1 = '22222222-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const S2 = '11111111-0000-0000-0000-000000000002';
const W1 = '33333333-0000-0000-0000-000000000001';

type Body = Record<string, unknown> & { lines?: Record<string, unknown>[] };
let previewFails = false;
let saveError: { status: number; errors: Record<string, string[]> } | null = null;

/** Önizleme: satırlar ters sırada döner (hesaplanan sütun dizinle değil rowKey ile eşlenmeli). */
function preview(body: Body) {
  const lines = (body.lines ?? []).map((line, index) => {
    const subtotal = Number(line.quantity) * Number(line.unitPrice);
    const discount = subtotal * Number(line.discountPercent ?? 0) / 100;
    const tax = (subtotal - discount) * Number(line.vatPercent ?? 0) / 100;
    return { rowKey: line.rowKey, lineNumber: index + 1, stockItemId: line.stockItemId, lineSubtotal: subtotal, discountAmount: discount,
      taxableAmount: subtotal - discount, taxAmount: tax, withholdingAmount: 0, lineTotal: subtotal - discount + tax };
  });
  const sum = (field: 'lineSubtotal' | 'discountAmount' | 'taxAmount' | 'lineTotal') => lines.reduce((total, line) => total + line[field], 0);
  return { currencyCode: 'TRY', accountingProfileCode: null, lineCount: lines.length, subtotal: sum('lineSubtotal'), discountTotal: sum('discountAmount'),
    taxableTotal: sum('lineSubtotal') - sum('discountAmount'), taxTotal: sum('taxAmount'), grossTotal: sum('lineTotal'), withholdingTotal: 0,
    grandTotal: sum('lineTotal'), lines: [...lines].reverse(),
    taxes: lines.length > 0 ? [{ code: 'KDV20', name: 'KDV %20', rate: 20, treatment: 'Additive', taxableAmount: sum('lineSubtotal') - sum('discountAmount'), amount: sum('taxAmount') }] : [] };
}

function respond(url: string, method: string, body?: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/customers') return page([{ id: C1, code: 'C-1', name: 'Acme', type: 'Customer', isActive: true, currencyCode: 'TRY' }]);
    if (path === '/api/stock/items') {
      return page([
        { id: S1, code: 'STK-1', name: 'Koli', isActive: true, unitCode: 'ADET', salesListPrice: 100, salesVatPercent: 20, salesDiscountPercent: 10, priceCurrencyCode: 'TRY' },
        { id: S2, code: 'STK-2', name: 'Bant', isActive: true, unitCode: 'RULO', salesListPrice: 5, salesVatPercent: 10, salesDiscountPercent: 0, priceCurrencyCode: 'TRY' },
      ]);
    }
    if (path === '/api/warehouses') return [{ id: W1, code: 'MRK', name: 'Merkez', isActive: true }];
    if (path === '/api/finance/general-ledger/rule-profiles') return [];
    if (path === '/api/sales/invoices/custom-fields') return [];
  } else if (method === 'POST') {
    if (path === '/api/sales/invoices/preview') {
      if (previewFails) return Promise.reject(Object.assign(new Error('Önizleme hatası'), { status: 400 }));
      return preview(JSON.parse(body!) as Body);
    }
    if (path === '/api/sales/invoices') {
      if (saveError) return Promise.reject(Object.assign(new Error('Doğrulama hatası'), { status: saveError.status, fieldErrors: saveError.errors }));
      return { id: 'inv1', code: 'FTR-1', status: 'Posted', grandTotal: 108 };
    }
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); previewFails = false; saveError = null; h.listen(); });
afterEach(() => { h.reset(); cleanup(); setPageParams(KEY, {}); });

const posts = (path: string) => h.state.calls.filter((call) => call.method === 'POST' && call.url.split('?')[0] === path);
const lastPreview = () => JSON.parse(posts('/api/sales/invoices/preview').at(-1)!.body!) as Body;
const cell = (key: string, code: string) => document.getElementById(`page-grid-kalemler-${key}-${code}`) as HTMLInputElement;
const calc = (row: number) => screen.getByLabelText(`Tutar (satır ${row})`).textContent;
const metric = (title: string) => screen.getByText(title).closest('.tenant-page-metric, section, article, div')!.parentElement!.textContent ?? '';
const pick = async (element: HTMLElement, option: RegExp) => {
  fireEvent.click(element);
  fireEvent.click(await screen.findByRole('option', { name: option }, T));
};
const type = (element: HTMLInputElement, value: string) => fireEvent.change(element, { target: { value } });

/** Müşteri (sayfa parametresi) ve bir satır: stok seçilir, depo seçilir, miktar yazılır. */
async function fillOneLine() {
  await waitFor(() => expect(h.gets('/api/stock/items').length).toBeGreaterThan(0), T);
  fireEvent.click(await screen.findByRole('button', { name: 'Satır ekle' }, T));
  await waitFor(() => expect(cell('yeni-1', 'stockItemId')).toBeTruthy(), T);
  await pick(cell('yeni-1', 'stockItemId'), /^STK-1/);
  await pick(cell('yeni-1', 'warehouseId'), /^MRK/);
  type(cell('yeni-1', 'quantity'), '1');
}

describe('Yeni satış faturası standart kartı', { timeout: 40000 }, () => {
  it('is a v1 preview standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 1, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
  });

  it('a stock choice fills unit, list price, discount and VAT; amounts and totals come from the server preview by row key', async () => {
    setPageParams(KEY, { customerId: C1 });
    h.setup();
    await fillOneLine();
    expect(cell('yeni-1', 'unitPrice').value).toBe('100');
    expect(cell('yeni-1', 'discountPercent').value).toBe('10');
    expect(cell('yeni-1', 'vatPercent').value).toBe('20');
    expect(screen.getByLabelText('Birim (satır 1)')).toBeTruthy();
    await waitFor(() => expect(calc(1)).toBe('108,00'), T);
    const sent = lastPreview();
    expect(sent).toMatchObject({ customerId: C1, warehouseId: W1, invoiceType: 'Wholesale' });
    expect(sent.lines).toEqual([{ stockItemId: S1, warehouseId: W1, quantity: 1, unitCode: 'ADET', unitPrice: 100, discountPercent: 10, vatPercent: 20, rowKey: 'yeni-1' }]);
    await waitFor(() => expect(metric('Genel toplam')).toContain('108,00'), T);
    expect(metric('Ara toplam')).toContain('100,00');
    expect(metric('KDV ve vergiler')).toContain('18,00');
    await waitFor(() => expect(screen.getByText('KDV %20')).toBeTruthy(), T);

    // Kullanıcının yazdığı fiyat ikinci stok seçiminde korunur; önceki seçimin doldurduğu KDV değişir.
    type(cell('yeni-1', 'unitPrice'), '90');
    await pick(cell('yeni-1', 'stockItemId'), /^STK-2/);
    await waitFor(() => expect(cell('yeni-1', 'vatPercent').value).toBe('10'), T);
    expect(cell('yeni-1', 'unitPrice').value).toBe('90');

    // İkinci satır: yanıt ters sırada gelse de her satır kendi tutarını gösterir.
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    await waitFor(() => expect(cell('yeni-2', 'stockItemId')).toBeTruthy(), T);
    await pick(cell('yeni-2', 'stockItemId'), /^STK-1/);
    await pick(cell('yeni-2', 'warehouseId'), /^MRK/);
    type(cell('yeni-2', 'quantity'), '2');
    await waitFor(() => expect(calc(2)).toBe('216,00'), T);
    expect(calc(1)).toBe('99,00');
  });

  it('Faturayı kes posts the user inputs (never preview values or row keys) with a stable requestId', async () => {
    setPageParams(KEY, { customerId: C1 });
    h.setup();
    await fillOneLine();
    await waitFor(() => expect(calc(1)).toBe('108,00'), T);
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(posts('/api/sales/invoices')).toHaveLength(1), T);
    const body = JSON.parse(posts('/api/sales/invoices')[0].body!) as Body;
    expect(body).toMatchObject({ customerId: C1, warehouseId: W1, invoiceType: 'Wholesale' });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.lines).toEqual([{ stockItemId: S1, warehouseId: W1, quantity: 1, unitCode: 'ADET', unitPrice: 100, discountPercent: 10, vatPercent: 20 }]);
    // Senaryo seçilmedi: e-belge nesnesinde yalnız varsayılan tür kodu gider (iç seri).
    expect(body.eDocument).toEqual({ typeCode: 'SATIS' });
    await waitFor(() => expect(h.state.navigations.some((item) => item.page === 'sales-invoices')).toBe(true), T);
  });

  it('a failed preview shows "—" and never blocks save', async () => {
    previewFails = true;
    setPageParams(KEY, { customerId: C1 });
    h.setup();
    await fillOneLine();
    await waitFor(() => expect(posts('/api/sales/invoices/preview').length).toBeGreaterThan(0), T);
    await new Promise((done) => setTimeout(done, 600));
    expect(calc(1)).toBe('—');
    expect(metric('Genel toplam')).toContain('—');
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(posts('/api/sales/invoices')).toHaveLength(1), T);
  });

  it('server field errors land on the customer input and the grid cell of the sent line', async () => {
    setPageParams(KEY, { customerId: C1 });
    h.setup();
    await fillOneLine();
    saveError = { status: 400, errors: { CustomerId: ['Müşteri pasif.'], 'Lines[0].Quantity': ['Stok yetersiz.'] } };
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(posts('/api/sales/invoices')).toHaveLength(1), T);
    await waitFor(() => expect(cell('yeni-1', 'quantity').closest('td')!.textContent).toContain('Stok yetersiz.'), T);
    expect(document.body.textContent).toContain('Müşteri pasif.');
  });

  it('e-Arşiv payment fields appear only for EARSIVFATURA and are sent nested under eDocument', async () => {
    setPageParams(KEY, { customerId: C1 });
    h.setup();
    await fillOneLine();
    expect(screen.queryByLabelText('Satın alma adresi (URL)')).toBeNull();
    fireEvent.change(document.getElementById('page-input-eSenaryo')!, { target: { value: 'EARSIVFATURA' } });
    const url = await screen.findByLabelText('Satın alma adresi (URL)', {}, T);
    type(url as HTMLInputElement, 'https://shop.example/1');
    fireEvent.click(h.command('save'));
    await waitFor(() => expect(posts('/api/sales/invoices')).toHaveLength(1), T);
    const body = JSON.parse(posts('/api/sales/invoices')[0].body!) as Body;
    expect(body.eDocument).toMatchObject({ scenario: 'EARSIVFATURA', typeCode: 'SATIS', purchaseUrl: 'https://shop.example/1' });
    expect(within(document.body).queryByText('Alıcı e-Fatura etiketi')).toBeNull();
  });
});
