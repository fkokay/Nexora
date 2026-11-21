import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingQuotesOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Tedarikçi teklifleri" standart tanımı (sales-purchase-quotes.json): salt okunur liste ve panel, talebe / siparişe geçiş.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-quotes';
const SQ1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const REQ = '33333333-0000-0000-0000-000000000001';
const PO = '55555555-0000-0000-0000-000000000001';
const quote = { id: SQ1, code: 'TT-0001', purchaseRequestId: REQ, requestCode: 'TLP-0001', supplierId: 's1', supplierName: 'Ege Ambalaj', quoteDate: '2026-11-11',
  validUntil: '2026-12-01', status: 'Selected', grandTotal: 8400, currencyCode: 'TRY', purchaseOrderId: PO };

function respond(path: string, method: string): unknown {
  if (method !== 'GET') return undefined;
  if (path === '/api/purchasing/supplier-quotes') return page([quote]);
  if (path === `/api/purchasing/supplier-quotes/${SQ1}`)
    return { ...quote, lines: [{ stockCode: 'AMB-1', stockName: 'Koli 40x30', quantity: 200, unitPrice: 35, discountPercent: 0, vatPercent: 20, lineTotal: 8400 }], customFields: [] };
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-requests', 'sales-purchasing']));

describe('Tedarikçi teklifleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the quotes; a selected quote loads its detail and opens its request (legacy) and its order', async () => {
    h.setup(respond);
    await h.select('TT-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/supplier-quotes/${SQ1}`).length).toBeGreaterThan(0), T);
    await h.ready('open');
    fireEvent.click(h.command('open'));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-requests', params: { requestId: REQ }, legacy: true });
    fireEvent.click(await h.menuItem(/^Siparişi aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'sales-purchasing', params: { purchaseOrderId: PO } });
    expect(h.writes()).toEqual([]);
    expect(screen.getAllByText('Ege Ambalaj').length).toBeGreaterThan(0);
  });
});
