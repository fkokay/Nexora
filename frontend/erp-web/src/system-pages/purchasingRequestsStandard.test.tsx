import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingRequestsOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Satınalma talepleri" standart tanımı (sales-requests.json) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-requests';
const Q1 = '33333333-0000-0000-0000-000000000001';
const Q2 = '33333333-0000-0000-0000-000000000002';
const Q3 = '33333333-0000-0000-0000-000000000003';
const PO = '44444444-0000-0000-0000-000000000001';
const request = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, description: `${code} açıklama`, requestedByName: 'Ayşe Talep', requestDate: '2026-11-10', neededByDate: '2026-11-30', neededByDays: 9,
  lineCount: 2, quoteCount: 1, status, purchaseOrderId: null, purchaseOrderCode: null, reviewedByName: null, reviewNote: null, createdAt: '2026-11-10T09:00:00Z', ...extra,
});
const rows = () => [request(Q1, 'TLP-0001', 'Submitted'), request(Q2, 'TLP-0002', 'Ordered', { purchaseOrderId: PO, purchaseOrderCode: 'SA-0009' }), request(Q3, 'TLP-0003', 'Approved')];

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/purchasing/requests') return page(rows(), 3);
    const detail = /^\/api\/purchasing\/requests\/([^/]+)$/.exec(path);
    if (detail) return { ...rows().find((row) => row.id === detail[1]), lines: [{ lineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', quantity: 200 }] };
    if (/\/supplier-quotes$/.test(path)) return [{ id: 'sq1', code: 'TT-1', supplierName: 'Ege Ambalaj', validUntil: '2026-12-01', grandTotal: 8400, comparableGrandTotal: 8400, baseCurrencyCode: 'TRY', status: 'Submitted' }];
    if (/\/custom-fields$/.test(path)) return [];
  }
  if (method === 'POST' && /^\/api\/purchasing\/requests\/[^/]+\/decision$/.test(path)) return {};
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchasing']));

describe('Satınalma talepleri standart tanımı', { timeout: 30000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the requests with status labels and counter queries', async () => {
    h.setup(respond);
    await h.cell('TLP-0001');
    expect(screen.getAllByText('Onay bekliyor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Siparişe dönüştü').length).toBeGreaterThan(0);
    const statuses = h.gets('/api/purchasing/requests').map((call) => new URLSearchParams(call.url.split('?')[1] ?? '').get('status'));
    expect(statuses).toEqual(expect.arrayContaining(['Submitted', 'Approved', 'Ordered', 'Rejected']));
  });

  it('a selected row loads its lines, quotes and fields for the panel', async () => {
    h.setup(respond);
    await h.select('TLP-0001');
    await waitFor(() => expect(h.gets(`/api/purchasing/requests/${Q1}`).length).toBeGreaterThan(0), T);
    await waitFor(() => expect(h.gets(`/api/purchasing/requests/${Q1}/supplier-quotes`).length).toBeGreaterThan(0), T);
    expect(h.gets(`/api/purchasing/requests/${Q1}/custom-fields`).length).toBeGreaterThan(0);
  });

  it('Onayla asks for an optional note and posts the approval decision', async () => {
    h.setup(respond);
    await h.select('TLP-0001');
    fireEvent.click(await h.menuItem(/^Onayla/));
    const dialog = await h.answer('Onayla', 'Bütçe uygun');
    expect(dialog.textContent).toContain('TLP-0001 talebi onaylansın mı?');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0].url).toBe(`/api/purchasing/requests/${Q1}/decision`);
    expect(h.bodyOf(h.writes()[0])).toEqual({ approved: true, note: 'Bütçe uygun' });
  });

  it('Reddet requires a reason and posts the rejection decision', async () => {
    h.setup(respond);
    await h.select('TLP-0001');
    fireEvent.click(await h.menuItem(/^Reddet/));
    const dialog = await h.answer('Reddet', 'Stokta var');
    expect(dialog.textContent).toContain('Ret gerekçesi');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.bodyOf(h.writes()[0])).toEqual({ approved: false, note: 'Stokta var' });
  });

  it('decisions are disabled for a request that is not waiting; Siparişi aç opens its order', async () => {
    h.setup(respond);
    await h.select('TLP-0002');
    fireEvent.click(await h.menuItem(/^Siparişi aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: 'sales-purchasing', params: { purchaseOrderId: PO } });
    expect(h.writes()).toEqual([]);
  });

  it('Teklif ekle (approved request) opens the legacy request screen with requestId', async () => {
    h.setup(respond);
    await h.select('TLP-0003');
    fireEvent.click(await h.menuItem(/^Teklif ekle/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, params: { requestId: Q3 }, legacy: true });
  });
});
