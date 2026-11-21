import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingDeliveryNotesOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Gelen irsaliyeler" standart tanımı (sales-purchase-delivery-notes.json): liste, salt okunur belge ve bağlı kayıtlara geçiş.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-delivery-notes';
const N1 = 'cccccccc-0000-0000-0000-000000000001';
const PO = '55555555-0000-0000-0000-000000000001';
const R1 = '66666666-0000-0000-0000-000000000001';
const note = { id: N1, documentNumber: 'IRS-0001', documentDate: '2026-11-03', purchaseOrderId: PO, purchaseOrderCode: 'SA-0001', supplierName: 'Ege Ambalaj',
  purchaseReceiptId: R1, purchaseReceiptCode: 'MK-0001', lineCount: 1 };

function respond(path: string, method: string): unknown {
  if (method !== 'GET') return undefined;
  if (path === '/api/purchasing/delivery-notes') return page([note]);
  if (path === `/api/purchasing/delivery-notes/${N1}`) return { ...note, lines: [{ orderLineNumber: 1, unitCode: 'ADET', quantity: 4 }] };
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchasing', 'sales-purchase-receipts']));

describe('Gelen irsaliyeler standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the notes and opens the read-only document with its lines', async () => {
    h.setup(respond);
    fireEvent.doubleClick(await h.cell('IRS-0001'));
    await waitFor(() => expect(h.gets(`/api/purchasing/delivery-notes/${N1}`).length).toBeGreaterThan(0), T);
    expect(await screen.findByText('Satırlar', {}, T)).toBeTruthy();
    expect(h.writes()).toEqual([]);
  });

  it('Siparişi aç and Mal kabulü aç carry the linked ids', async () => {
    h.setup(respond);
    await h.select('IRS-0001');
    fireEvent.click(await h.menuItem(/^Siparişi aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchasing', params: { purchaseOrderId: PO } });
    fireEvent.click(await h.menuItem(/^Mal kabulü aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'sales-purchase-receipts', params: { receiptId: R1 }, legacy: true });
  });
});
