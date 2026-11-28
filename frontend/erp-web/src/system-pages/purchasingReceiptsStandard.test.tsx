import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingReceiptsOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Mal kabulleri" standart tanımı (sales-purchase-receipts.json, Liste kalıbı): liste, detay, siparişsiz kabul ve izlemeli kabul.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-purchase-receipts';
const R1 = '66666666-0000-0000-0000-000000000001';
const R2 = '66666666-0000-0000-0000-000000000002';
const receipt = (id: string, code: string, status: string) => ({
  id, code, purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0001', warehouseId: 'w1', warehouseName: 'Ana depo', receiptDate: '2026-11-04',
  status, lineCount: 1, createdAt: '2026-11-04T10:00:00Z',
});
const rows = () => [
  { ...receipt(R1, 'MK-0001', 'Posted'), currencyCode: 'TRY', pricedGrandTotal: 480, pricingState: 'PartlyFree' },
  receipt(R2, 'MK-0002', 'Voided'),
];
let voidFailure: { status: number; message: string } | null = null;
const ORDERLESS_ID = '77777777-0000-0000-0000-000000000001';

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/purchasing/standalone-invoices/suppliers') return page([{ id: 'supplier-1', code: 'SUP-1', name: 'Tedarikçi' }]);
    if (path === '/api/warehouses') return [{ id: 'warehouse-1', code: 'WH-1', name: 'Ana depo' }];
    if (path === '/api/stock/items') return page([{ id: 'stock-1', code: 'MAT-1', name: 'Malzeme', unitCode: 'EA' }]);
    if (path === '/api/purchasing/receipts') return page(rows());
    const one = /^\/api\/purchasing\/receipts\/([^/]+)$/.exec(path);
    if (one) {
      return { ...rows().find((row) => row.id === one[1]), supplierId: 's1', supplierName: 'Ege Ambalaj', invoice: null, customFields: [],
        lines: [{ orderLineNumber: 1, stockItemId: 'st1', stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 4, enteredQuantity: 4, enteredUnitCode: 'ADET' }] };
    }
  }
  if (method === 'POST' && path === '/api/purchasing/standalone-receipts') return { id: ORDERLESS_ID, code: 'GR-OPEN-1', status: 'Draft' };
  if (method === 'POST' && path === `/api/purchasing/standalone-receipts/${ORDERLESS_ID}/post`) return { id: ORDERLESS_ID, status: 'Posted' };
  if (method === 'POST' && /^\/api\/purchasing\/receipts\/[^/]+\/void$/.test(path)) {
    if (voidFailure) {
      const failure = voidFailure;
      voidFailure = null;
      throw Object.assign(new Error(failure.message), { status: failure.status });
    }
    return {};
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); voidFailure = null; h.listen(); });
afterEach(() => { h.reset(); cleanup(); });

describe('Mal kabulleri standart tanımı', { timeout: 30000 }, () => {
  it('is a v4 preview Liste standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 4, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect((h.standard.definition as unknown as { template: unknown }).template).toEqual({ name: 'list' });
  });

  it('defines an orderless receipt dialog with a stop-on-error draft and post sequence', () => {
    const components = h.standard.definition.components;
    const dialog = components.find((item) => item.id === 'siparissizPencere');
    expect(dialog?.props).toMatchObject({ saveSequence: ['siparissizTaslak', 'siparissizKaydet'], stopOnError: true });
    expect(components.find((item) => item.id === 'siparissizKalemleri')?.props?.gridColumns).toHaveLength(7);
    expect(h.standard.definition.queries.find((item) => item.id === 'siparissizTaslak')?.operation).toBe('satinalma.malKabul.siparissizOlustur');
    expect(h.standard.definition.queries.find((item) => item.id === 'siparissizKaydet')?.operation).toBe('satinalma.malKabul.siparissizKaydet');
  });

  it('saves the orderless receipt window by creating a draft and then posting it', async () => {
    const components = h.standard.definition.components;
    components.find((item) => item.id === 'siparissizTedarikci')!.props!.staticOptions = ['supplier-1=Tedarikçi'];
    components.find((item) => item.id === 'siparissizDepo')!.props!.staticOptions = ['warehouse-1=Ana depo'];
    components.find((item) => item.id === 'siparissizKalemleri')!.props!.columnStaticOptions = ['stockItemId=stock-1=MAT-1 · Malzeme'];
    h.setup();
    await h.selectRow('MK-0001');
    fireEvent.click(await h.menuItem(/^Siparişsiz mal kabul$/));
    const dialog = await h.dialog(/^Siparişsiz mal kabul$/);
    const supplier = within(dialog).getByLabelText('Tedarikçi');
    fireEvent.keyDown(supplier, { key: 'ArrowDown' });
    fireEvent.keyDown(supplier, { key: 'Enter' });
    const warehouse = within(dialog).getByLabelText('Depo');
    fireEvent.keyDown(warehouse, { key: 'ArrowDown' });
    fireEvent.keyDown(warehouse, { key: 'Enter' });
    fireEvent.change(within(dialog).getByLabelText('Tarih'), { target: { value: '2026-11-28' } });
    fireEvent.change(within(dialog).getByLabelText('Mal kabul no'), { target: { value: 'GR-OPEN-1' } });
    const grid = within(dialog).getByText('Mal kabul satırları').closest('section')!;
    fireEvent.click(within(grid).getByRole('button', { name: 'Satır ekle' }));
    const stock = within(grid).getByLabelText('Stok (satır 1)');
    fireEvent.click(stock);
    fireEvent.click(within(dialog).getByRole('option', { name: /MAT-1 · Malzeme/ }));
    expect((stock as HTMLInputElement).value).not.toBe('');
    fireEvent.change(within(grid).getByLabelText('Miktar (satır 1)'), { target: { value: '3' } });
    fireEvent.change(within(grid).getByLabelText('Birim (satır 1)'), { target: { value: 'EA' } });
    fireEvent.change(within(grid).getByLabelText('Birim maliyet (satır 1)'), { target: { value: '12.5' } });
    const save = within(dialog).getByRole('button', { name: 'Kaydet' });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await h.waitWrites(2);
    expect(h.writes().map((call) => call.url)).toEqual([
      '/api/purchasing/standalone-receipts', `/api/purchasing/standalone-receipts/${ORDERLESS_ID}/post`,
    ]);
    expect(JSON.parse(h.writes()[0].body!).lines).toMatchObject([{ stockItemId: 'stock-1', quantity: 3, unitCode: 'EA', unitCostBase: 12.5 }]);
  });

  it('lists the first page with status labels; a selected row loads the receipt', async () => {
    h.setup();
    await h.selectRow('MK-0001');
    expect(query(h.gets('/api/purchasing/receipts')[0].url).get('pageSize')).toBe('25');
    expect(screen.getAllByText('Kabul edildi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kısmen bedelsiz').length).toBeGreaterThan(0);
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
  });

  it('Aç opens the receipt window with its lines', async () => {
    h.setup();
    await h.selectRow('MK-0001');
    await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
    fireEvent.click(h.command('open'));
    const opened = await h.dialog(/Mal kabul · MK-0001/);
    await waitFor(() => expect(opened.textContent).toContain('AMB-1'), T);
  });

  it('İptal et asks first and posts the void of the selected receipt', async () => {
    h.setup();
    await h.selectRow('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^İptal et/));
    await h.confirm('MK-0001 mal kabulü iptal edilsin mi?');
    await h.waitWrites(1);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/receipts/${R1}/void` });
  });

  it('a 409 on cancel shows the configured text with the server reason', async () => {
    h.setup();
    await h.selectRow('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
    voidFailure = { status: 409, message: 'Bağlı alış faturası önce iptal edilmeli.' };
    fireEvent.click(await h.menuItem(/^İptal et/));
    await h.confirm();
    expect(await screen.findByText(/Mal kabul iptal edilemedi\. \(Bağlı alış faturası önce iptal edilmeli\.\)/, {}, T)).toBeTruthy();
  });

  it('Faturala opens invoice entry with receiptId; there is no Siparişsiz mal kabul / Eski ekranda aç command', async () => {
    h.setup();
    await h.selectRow('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^Faturala/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'purchase-invoice-document', params: { receiptId: R1 } });
    expect(h.menuItems().some((item) => /Siparişsiz mal kabul/.test(item))).toBe(true);
    expect(h.menuItems().some((item) => /Eski ekran/.test(item))).toBe(false);
  });
});
