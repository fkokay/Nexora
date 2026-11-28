import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingReceiptsOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Mal kabulleri" standart tanımı (sales-purchase-receipts.json, Liste kalıbı): sayfalı liste, detay paneli, Aç penceresi,
// onaylı iptal ve Faturala gezinmesi. Siparişsiz / izlemeli kabul bu ekranda yok (kalıba pencere satır tablosu gelince eklenecek).

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

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/purchasing/receipts') return page(rows());
    const one = /^\/api\/purchasing\/receipts\/([^/]+)$/.exec(path);
    if (one) {
      return { ...rows().find((row) => row.id === one[1]), supplierId: 's1', supplierName: 'Ege Ambalaj', invoice: null, customFields: [],
        lines: [{ orderLineNumber: 1, stockItemId: 'st1', stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 4, enteredQuantity: 4, enteredUnitCode: 'ADET' }] };
    }
  }
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
  it('is a v3 preview Liste standard that uses only operations from the catalog fixture', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 3, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect((h.standard.definition as unknown as { template: unknown }).template).toEqual({ name: 'list' });
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
    expect(h.menuItems().some((item) => /Siparişsiz|Eski ekran/.test(item))).toBe(false);
  });
});
