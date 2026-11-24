import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingRequestsOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Satınalma talepleri" standart tanımı (sales-requests.json, v2) gerçek çalışma zamanıyla çizilir; API sahte yanıtlar döner.
// v2: yeni talep (satırlı), talep kalemlerinden teklif girişi (teklifKaydet), talepten ve tekliften sipariş (siparisOlustur).

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-requests';
const Q1 = '33333333-0000-0000-0000-000000000001';
const Q2 = '33333333-0000-0000-0000-000000000002';
const Q3 = '33333333-0000-0000-0000-000000000003';
const PO = '44444444-0000-0000-0000-000000000001';
const SUP = '77777777-0000-0000-0000-000000000001';
const SQ = '99999999-0000-0000-0000-000000000001';
const W1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const S1 = '11111111-0000-0000-0000-000000000001';
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const request = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, description: `${code} açıklama`, requestedByName: 'Ayşe Talep', requestDate: '2026-11-10', neededByDate: '2026-11-30', neededByDays: 9,
  lineCount: 2, quoteCount: 1, status, purchaseOrderId: null, purchaseOrderCode: null, reviewedByName: null, reviewNote: null, createdAt: '2026-11-10T09:00:00Z', ...extra,
});
const rows = () => [request(Q1, 'TLP-0001', 'Submitted'), request(Q2, 'TLP-0002', 'Ordered', { purchaseOrderId: PO, purchaseOrderCode: 'SA-0009' }), request(Q3, 'TLP-0003', 'Approved')];
const requestLines = [
  { lineNumber: 1, stockItemId: S1, stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 200 },
  { lineNumber: 2, stockItemId: 'st2', stockCode: 'AMB-2', stockName: 'Bant', unitCode: 'RULO', quantity: 3 },
];
const quote = { id: SQ, purchaseRequestId: Q3, code: 'TT-1', supplierId: SUP, supplierName: 'Ege Ambalaj', quoteDate: '2026-11-11', validUntil: '2026-12-01',
  currencyCode: 'TRY', status: 'Submitted', grandTotal: 8400, comparableGrandTotal: 8400, baseCurrencyCode: 'TRY' };
const quoteLines = [
  { requestLineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 200, unitPrice: 35, discountPercent: 0, vatPercent: 20, lineTotal: 8400 },
  { requestLineNumber: 2, stockCode: 'AMB-2', stockName: 'Bant', unitCode: 'RULO', quantity: 3, unitPrice: 10, discountPercent: 5, vatPercent: 20, lineTotal: 34.2 },
];
const supplier = { id: SUP, code: '320.01', name: 'Ege Ambalaj', type: 'Supplier', isActive: true, currencyCode: 'TRY' };

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/purchasing/requests') return page(rows(), 3);
    const detail = /^\/api\/purchasing\/requests\/([^/]+)$/.exec(path);
    if (detail) return { ...rows().find((row) => row.id === detail[1]), lines: requestLines };
    if (/\/supplier-quotes$/.test(path)) return [quote];
    if (path === `/api/purchasing/supplier-quotes/${SQ}`) return { ...quote, lines: quoteLines };
    if (/\/custom-fields$/.test(path)) return [];
    if (path === '/api/customers') return page([supplier]);
    if (path === '/api/warehouses') return [{ id: W1, code: 'D1', name: 'Ana depo', isActive: true, rowVersion: 'rv' }];
    if (path === '/api/stock/items') return page([{ id: S1, code: 'AMB-1', name: 'Koli 40x30', unitCode: 'ADET', isActive: true }]);
    if (/^\/api\/stock\/items\/[^/]+\/units$/.test(path)) return { baseUnitCode: 'ADET', conversions: [{ id: 'u1', unitCode: 'KOLI', factorToBase: 12, isActive: true }] };
  }
  if (method === 'POST') {
    if (/^\/api\/purchasing\/requests\/[^/]+\/decision$/.test(path)) return {};
    if (path === '/api/purchasing/requests') return { ...request('33333333-0000-0000-0000-000000000009', 'TLP-0009', 'Submitted') };
    if (path === `/api/purchasing/requests/${Q3}/supplier-quotes`) return { ...quote, id: 'sq2', code: 'TKL-9' };
    if (path === `/api/purchasing/requests/${Q3}/order`) return { id: PO, code: 'PO-9', status: 'Open' };
  }
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchasing']));

describe('Satınalma talepleri standart tanımı', { timeout: 60000 }, () => {
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

  it('Yeni talep posts the header and the stock lines; the stock pick fills the unit and an empty code is left out', async () => {
    h.setup(respond);
    await h.cell('TLP-0001');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni satınalma talebi' }, T);
    h.type(h.input('talepAciklamasi'), 'Ambalaj ihtiyacı');
    h.type(h.input('ihtiyacTarihi'), '2026-12-15');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kalem ekle' }));
    await h.pick(h.gridCell('talepKalemleri', 'yeni-1', 'stockItemId')!, 'AMB-1');
    await waitFor(() => expect(h.gridCell('talepKalemleri', 'yeni-1', 'unitCode')!.value).not.toBe(''), T);
    h.type(h.gridCell('talepKalemleri', 'yeni-1', 'quantity')!, '150');
    expect(await within(dialog).findByText(/Kalem: 1 \/ 100/, {}, T)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => expect(h.sent('/api/purchasing/requests')).toHaveLength(1), T);
    // Boş talep no "" gider: sunucu boş kodda numara verir (Program.cs IsNullOrWhiteSpace).
    expect(h.bodyOf(h.sent('/api/purchasing/requests')[0])).toEqual({
      code: '', requestDate: today(), neededByDate: '2026-12-15', description: 'Ambalaj ihtiyacı',
      lines: [{ stockItemId: S1, quantity: 150, unitCode: 'ADET' }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni satınalma talebi' })).toBeNull(), T);
  });

  it('Teklif ekle fills the request lines; prices and formulas give the posted quote lines', async () => {
    h.setup(respond);
    await h.select('TLP-0003');
    fireEvent.click(await h.menuItem(/^Teklif ekle/));
    const dialog = await screen.findByRole('dialog', { name: /Tedarikçi teklifi · TLP-0003/ }, T);
    await waitFor(() => expect(h.gridCell('teklifKalemleri', 'dolu-1', 'requestLineNumber')?.value).toBe('1'), T);
    expect(h.gridCell('teklifKalemleri', 'dolu-1', 'quantity')!.value).toBe('200');
    expect(h.gridCell('teklifKalemleri', 'dolu-2', 'requestLineNumber')!.value).toBe('2');
    await h.pick(h.input('teklifTedarikci'), 'Ege Ambalaj');
    h.type(h.input('teklifNo'), 'tkl-9');
    h.type(h.gridCell('teklifKalemleri', 'dolu-1', 'unitPrice')!, '35');
    h.type(h.gridCell('teklifKalemleri', 'dolu-1', 'discountPercent')!, '0');
    h.type(h.gridCell('teklifKalemleri', 'dolu-1', 'vatPercent')!, '20');
    h.type(h.gridCell('teklifKalemleri', 'dolu-2', 'unitPrice')!, '10');
    h.type(h.gridCell('teklifKalemleri', 'dolu-2', 'discountPercent')!, '5');
    h.type(h.gridCell('teklifKalemleri', 'dolu-2', 'vatPercent')!, '20');
    // 200 × 35 = 7000, KDV 1400; 3 × 10 −5 % = 28.5, KDV 5.7 → toplam 8434.2.
    await waitFor(() => expect(h.gridCell('teklifKalemleri', 'dolu-2', 'lineTotal')!.value).toBe('34.2'), T);
    expect(await within(dialog).findByText(/Net: 7028\.5 · KDV: 1405\.7 · Genel toplam: 8434\.2/, {}, T)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Teklifi kaydet' }));
    const url = `/api/purchasing/requests/${Q3}/supplier-quotes`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(url)[0])).toEqual({
      code: 'TKL-9', supplierId: SUP, quoteDate: today(), validUntil: null, notes: null,
      lines: [
        { requestLineNumber: 1, unitPrice: 35, discountPercent: 0, vatPercent: 20 },
        { requestLineNumber: 2, unitPrice: 10, discountPercent: 5, vatPercent: 20 },
      ],
    });
  });

  it('Siparişe dönüştür (no quote) fills the request lines and posts the order with lineNumber prices', async () => {
    h.setup(respond);
    await h.select('TLP-0003');
    fireEvent.click(await h.menuItem(/^Siparişe dönüştür/));
    const dialog = await screen.findByRole('dialog', { name: /Talepten sipariş · TLP-0003/ }, T);
    await waitFor(() => expect(h.gridCell('siparisKalemleri', 'dolu-2', 'lineNumber')?.value).toBe('2'), T);
    // Beklenen teslim talebin ihtiyaç tarihiyle açılır.
    await waitFor(() => expect(h.input('siparisTeslimTarihi').value).toBe('2026-11-30'), T);
    await h.pick(h.input('siparisTedarikci'), 'Ege Ambalaj');
    h.type(h.input('siparisNo'), 'po-9');
    await h.pick(h.input('siparisDepo'), 'Ana depo');
    for (const [key, price] of [['dolu-1', '35'], ['dolu-2', '10']]) {
      h.type(h.gridCell('siparisKalemleri', key, 'unitPrice')!, price);
      h.type(h.gridCell('siparisKalemleri', key, 'discountPercent')!, '0');
    }
    await waitFor(() => expect(h.gridCell('siparisKalemleri', 'dolu-1', 'lineTotal')!.value).toBe('7000'), T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Siparişi oluştur' }));
    const url = `/api/purchasing/requests/${Q3}/order`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(url)[0])).toEqual({
      code: 'PO-9', supplierId: SUP, orderDate: today(), notes: null, expectedReceiptDate: '2026-11-30', targetWarehouseId: W1,
      lines: [{ lineNumber: 1, unitPrice: 35, discountPercent: 0 }, { lineNumber: 2, unitPrice: 10, discountPercent: 0 }],
    });
  });

  const openQuoteTab = async () => {
    await h.select('TLP-0003');
    // Detay paneli tablonun araç çubuğundaki düğmedir (taslak 21).
    const panel = screen.getByRole('button', { name: 'Detay paneli' });
    if (panel.getAttribute('aria-pressed') !== 'true') fireEvent.click(panel);
    fireEvent.click(await screen.findByRole('tab', { name: /^Teklifler/ }, T));
    return document.getElementById('page-tabs-detaySekmeleri-panel-2')!;
  };

  // teklifTablosu tam tablo çizilir (kompakt `variant: "list"` satır eylemi ve seçim çizmez): "Tekliften sipariş" satırda görünür.
  it('the quote tab draws the Tekliften sipariş row action (standard as published)', async () => {
    h.setup(respond);
    const tab = await openQuoteTab();
    await within(tab).findByRole('button', { name: 'Tekliften sipariş' }, { timeout: 2000 });
  });

  it('Tekliften sipariş fills the quote lines as they are and posts the order with supplierQuoteId and the quote supplier', async () => {
    h.setup(respond);
    await openQuoteTab();
    const quoteRow = await h.row('TT-1');
    fireEvent.click(quoteRow);
    fireEvent.click(await within(quoteRow).findByRole('button', { name: 'Tekliften sipariş' }, T));
    const dialog = await screen.findByRole('dialog', { name: /Tekliften sipariş · TT-1 · Ege Ambalaj/ }, T);
    await waitFor(() => expect(h.gridCell('teklifSiparisKalemleri', 'dolu-2', 'lineNumber')?.value).toBe('2'), T);
    expect(h.gridCell('teklifSiparisKalemleri', 'dolu-2', 'unitPrice')!.readOnly).toBe(true);
    expect(h.gridCell('teklifSiparisKalemleri', 'dolu-2', 'discountPercent')!.value).toBe('5');
    expect(await within(dialog).findByText(/Genel toplam: 8434\.2 TRY/, {}, T)).toBeTruthy();
    h.type(h.input('tsSiparisNo'), 'po-10');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Siparişi oluştur' }));
    const url = `/api/purchasing/requests/${Q3}/order`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(url)[0])).toEqual({
      code: 'PO-10', supplierId: SUP, supplierQuoteId: SQ, orderDate: today(), notes: null, expectedReceiptDate: '2026-11-30', targetWarehouseId: null,
      lines: [
        { lineNumber: 1, unitPrice: 35, discountPercent: 0, vatPercent: 20 },
        { lineNumber: 2, unitPrice: 10, discountPercent: 5, vatPercent: 20 },
      ],
    });
  });

  it('quote and order commands are disabled for a TenantUser', async () => {
    h.setup(respond, { role: 'TenantUser' });
    await h.select('TLP-0003');
    fireEvent.click(h.command('more'));
    const item = await screen.findByRole('menuitem', { name: /^Teklif ekle/ }, T);
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: /^Siparişe dönüştür/ }).getAttribute('aria-disabled')).toBe('true');
  });
});
