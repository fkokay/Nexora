import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingQuotesOperations.fixture.json';
import { T, page, query, salesHarness } from './salesStandardHarness';

// "Tedarikçi teklifleri" standart tanımı (sales-purchase-quotes.json, Liste kalıbı): salt okunur liste ve detay paneli,
// Aç penceresinde satırlar, talebe (eski ekran) / siparişe geçiş. Yazma yok.

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../erpApi', () => ({ api }));

const KEY = 'sales-purchase-quotes';
const SQ1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const REQ = '33333333-0000-0000-0000-000000000001';
const PO = '55555555-0000-0000-0000-000000000001';
const quote = { id: SQ1, code: 'TT-0001', purchaseRequestId: REQ, requestCode: 'TLP-0001', supplierId: 's1', supplierName: 'Ege Ambalaj', quoteDate: '2026-11-11',
  validUntil: '2026-12-01', status: 'Selected', grandTotal: 8400, currencyCode: 'TRY', purchaseOrderId: PO };

function respond(url: string, method: string): unknown {
  const [path] = url.split('?');
  if (method === 'GET') {
    if (path === '/api/purchasing/supplier-quotes') return page([quote]);
    if (path === `/api/purchasing/supplier-quotes/${SQ1}`)
      return { ...quote, subtotal: 7000, discountTotal: 0, taxTotal: 1400, notes: 'Teslim 5 iş günü', baseCurrencyCode: 'TRY',
        lines: [{ stockCode: 'AMB-1', stockName: 'Koli 40x30', quantity: 200, unitPrice: 35, discountPercent: 0, vatPercent: 20, lineTotal: 8400 }], customFields: [] };
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const h = salesHarness(KEY, api, catalog, respond);
beforeEach(() => { api.mockReset(); localStorage.clear(); h.listen(); });
afterEach(() => { h.reset(); cleanup(); });

describe('Tedarikçi teklifleri standart tanımı', { timeout: 30000 }, () => {
  it('is a v2 preview Liste standard that uses only operations from the catalog fixture and writes nothing', () => {
    expect(h.standard).toMatchObject({ screenKey: KEY, version: 2, stage: 'preview' });
    const names = new Set(catalog.operations.map((operation) => operation.name));
    expect(h.standard.definition.queries.filter((item) => !names.has(item.operation))).toEqual([]);
    expect((h.standard.definition.queries as unknown as { kind: string }[]).filter((item) => item.kind !== 'read')).toEqual([]);
    expect((h.standard.definition as unknown as { template: unknown }).template).toEqual({ name: 'list' });
  });

  it('lists the quotes with the first page size; a selected quote loads its detail and fills the panel', async () => {
    h.setup();
    await h.selectRow('TT-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/supplier-quotes/${SQ1}`).length).toBeGreaterThan(0), T);
    expect(query(h.gets('/api/purchasing/supplier-quotes')[0].url).get('pageSize')).toBe('50');
    await waitFor(() => expect(document.body.textContent).toContain('Teslim 5 iş günü'), T);
    expect(screen.getAllByText('Ege Ambalaj').length).toBeGreaterThan(0);
  });

  it('Aç opens the quote window with its lines', async () => {
    h.setup();
    await h.selectRow('TT-0001');
    await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).not.toBe('true'), T);
    fireEvent.click(h.command('open'));
    const opened = await h.dialog(/Teklif · TT-0001/);
    await waitFor(() => expect(opened.textContent).toContain('AMB-1'), T);
    expect(within(opened).getByRole('tab', { name: /Satırlar/ })).toBeTruthy();
    expect(h.writes()).toEqual([]);
  });

  it('opens its request (legacy screen) and its order', async () => {
    h.setup();
    await h.selectRow('TT-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/supplier-quotes/${SQ1}`).length).toBeGreaterThan(0), T);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Talebi aç/ }, T))[0]);
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-requests', params: { requestId: REQ }, legacy: true });
    fireEvent.click(await h.menuItem(/^Siparişi aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(2), T);
    expect(h.state.navigations[1]).toMatchObject({ page: 'sales-purchasing', params: { purchaseOrderId: PO } });
    expect(h.writes()).toEqual([]);
  });
});
