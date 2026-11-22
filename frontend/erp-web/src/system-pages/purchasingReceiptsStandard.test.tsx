import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingReceiptsOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Mal kabulleri" standart tanımı (sales-purchase-receipts.json): sayfalı liste, panel, onaylı iptal ve Faturala gezinmesi.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-receipts';
const R1 = '66666666-0000-0000-0000-000000000001';
const R2 = '66666666-0000-0000-0000-000000000002';
const receipt = (id: string, code: string, status: string) => ({
  id, code, purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0001', warehouseId: 'w1', warehouseName: 'Ana depo', receiptDate: '2026-11-04',
  status, lineCount: 1, createdAt: '2026-11-04T10:00:00Z',
});
const rows = () => [receipt(R1, 'MK-0001', 'Posted'), receipt(R2, 'MK-0002', 'Voided')];
let voidFailure: { status: number; message: string } | null = null;

function respond(path: string, method: string): unknown {
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
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(() => { h.before(); voidFailure = null; });
afterEach(() => h.after(['sales-purchase-invoice-entry', 'sales-purchase-invoices']));

describe('Mal kabulleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the first page with status labels; a selected row loads the receipt and its lines', async () => {
    h.setup(respond);
    await h.cell('MK-0001');
    const list = h.gets('/api/purchasing/receipts')[0];
    expect(new URLSearchParams(list.url.split('?')[1]).get('pageSize')).toBe('25');
    expect(screen.getAllByText('Kabul edildi').length).toBeGreaterThan(0);
    await h.select('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
  });

  it('İptal et asks first and posts the void of the selected receipt', async () => {
    h.setup(respond);
    await h.select('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^İptal et/));
    const dialog = await screen.findByRole('alertdialog', {}, T);
    expect(dialog.textContent).toContain('MK-0001 mal kabulü iptal edilsin mi?');
    expect(h.writes()).toEqual([]);
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/receipts/${R1}/void` });
  });

  it('a 409 on cancel shows the configured text with the server reason', async () => {
    h.setup(respond);
    await h.select('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
    voidFailure = { status: 409, message: 'Bağlı alış faturası önce iptal edilmeli.' };
    fireEvent.click(await h.menuItem(/^İptal et/));
    await h.answer('Onayla');
    expect(await screen.findByText(/Mal kabul iptal edilemedi\. \(Bağlı alış faturası önce iptal edilmeli\.\)/, {}, T)).toBeTruthy();
  });

  it('Faturala opens invoice entry with receiptId; Siparişsiz mal kabul opens the legacy screen', async () => {
    h.setup(respond);
    await h.select('MK-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/receipts/${R1}`).length).toBeGreaterThan(0), T);
    fireEvent.click(await h.menuItem(/^Faturala/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchase-invoice-entry', params: { receiptId: R1 } });
    await h.ready('new');
    fireEvent.click(h.command('new'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: KEY, legacy: true });
  });
});
