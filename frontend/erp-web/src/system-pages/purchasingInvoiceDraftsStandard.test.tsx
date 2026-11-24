import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingInvoiceDraftsOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Bağımsız fatura taslakları" standart tanımı (sales-purchase-invoice-drafts.json): liste, yeni taslak (rowNumberColumn 1..n,
// gider hesabı ve mal kabul satırı seçimiyle dolma, formüller, belge tutarları satır toplamlarından, autoId requestId), taslak
// düzenleme (satırlardan doldurma, expectedRowVersion) ve onaylı muhasebeleştirme.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-invoice-drafts';
const D1 = 'eeeeeeee-0000-0000-0000-000000000001';
const D2 = 'eeeeeeee-0000-0000-0000-000000000002';
const SUP = '77777777-0000-0000-0000-000000000001';
const GL1 = 'ffffffff-0000-0000-0000-000000000001';
const RL1 = 'abababab-0000-0000-0000-000000000001';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE = '/api/purchasing/standalone-invoices';
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

const draft = (id: string, number: string, status: string) => ({ id, supplierId: SUP, supplierName: 'Ege Hizmet', invoiceNumber: number, invoiceDate: '2026-11-10',
  dueDate: '2026-12-10', currencyCode: 'TRY', grandTotal: 120, lineCount: 1, status, createdAt: '2026-11-10T09:00:00Z' });
const rows = () => [draft(D1, 'HZM-0001', 'Draft'), draft(D2, 'HZM-0002', 'Posted')];
const draftLines = [
  { id: 'dl1', lineNumber: 1, description: 'Danışmanlık', quantity: 1, unitCode: 'SAAT', unitPrice: 100, subtotal: 100, discountAmount: 0, taxAmount: 20, total: 120,
    expenseAccountId: GL1, vatRate: 20, standalonePurchaseReceiptLineId: null },
  { id: 'dl2', lineNumber: 5, description: 'Yol', quantity: 2, unitCode: 'ADET', unitPrice: 15, subtotal: 30, discountAmount: 0, taxAmount: 0, total: 30,
    expenseAccountId: GL1, vatRate: 0, standalonePurchaseReceiptLineId: null },
];
const detail = (id: string) => ({ ...rows().find((row) => row.id === id), notes: 'Kasım', subtotal: 130, discountTotal: 0, taxTotal: 20, grandTotal: 150,
  updatedAt: '2026-11-10T09:00:00Z', rowVersion: 'AAAAAAAAB9E=', lines: draftLines });

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === BASE) return page(rows());
    if (path === `${BASE}/suppliers`) return page([{ id: SUP, code: '320.05', name: 'Ege Hizmet', currencyCode: 'TRY' }]);
    if (path === `${BASE}/receipts`) {
      return [{ lineId: RL1, receiptId: 'r1', receiptCode: 'MK-0007', receiptDate: '2026-11-08', stockCode: 'AMB-1', stockName: 'Koli 40x30', quantity: 4, unitCode: 'ADET', unitCostBase: 12.5 }];
    }
    if (path === '/api/finance/general-ledger/accounts') {
      return [{ id: GL1, code: '770.01', name: 'Genel yönetim giderleri', isActive: true, statementSection: 'Expense', currencyCode: null },
        { id: 'gl-off', code: '770.99', name: 'Kapalı hesap', isActive: false, statementSection: 'Expense', currencyCode: null }];
    }
    const one = new RegExp(`^${BASE}/([^/]+)$`).exec(path);
    if (one) return detail(one[1]);
  }
  if (method === 'POST' && path === BASE) return { ...detail(D1), id: 'eeeeeeee-0000-0000-0000-000000000009', invoiceNumber: 'HZM-2026-0042' };
  if (method === 'PUT' && path === `${BASE}/${D1}`) return { ...detail(D1), rowVersion: 'AAAAAAAAB9F=' };
  if (method === 'POST' && path === `${BASE}/${D1}/post`) return { draftId: D1, status: 'Posted', journalEntryId: 'j1', ledgerEntryId: 'l1' };
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after());

const lineKey = (grid: string) => {
  const cells = document.querySelectorAll(`[id^="page-grid-${grid}-yeni-"][id$="-description"]`);
  return /page-grid-[^-]+-(yeni-\d+)-description/.exec(cells[cells.length - 1].id)![1];
};

describe('Bağımsız fatura taslakları standart tanımı', { timeout: 60000 }, () => {
  it('uses only operations from the catalog fixture', () => h.usesOnlyCatalog());

  it('lists the drafts with status labels; the expense account picker reads the fixed Expense filter', async () => {
    h.setup(respond);
    await h.cell('HZM-0001');
    expect(screen.getAllByText('Taslak').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Muhasebeleşti').length).toBeGreaterThan(0);
    const list = new URLSearchParams(h.gets(BASE)[0].url.split('?')[1]);
    expect([list.get('page'), list.get('pageSize')]).toEqual(['1', '25']);
  });

  it('Yeni taslak: rows numbered 1..n, fills from the expense account and receipt line, formulas, header amounts from totals, requestId', async () => {
    h.setup(respond);
    await h.cell('HZM-0001');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni bağımsız alış faturası taslağı' }, T);
    await h.pick(h.input('yeniTedarikci'), 'Ege Hizmet');
    h.type(h.input('yeniFaturaNo'), 'HZM-2026-0042');
    h.type(h.input('yeniVade'), '2026-12-31');

    // Satır 1: gider hesabı seçimi açıklamayı hesap adıyla doldurur; 2 × 100.10 = 200.2, −10 iskonto, KDV %20 → 38.04, toplam 228.24.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Satır ekle' }));
    const a = lineKey('yeniSatirlar');
    await h.pick(h.gridCell('yeniSatirlar', a, 'expenseAccountId')!, '770.01');
    await waitFor(() => expect(h.gridCell('yeniSatirlar', a, 'description')!.value).toBe('Genel yönetim giderleri'), T);
    h.type(h.gridCell('yeniSatirlar', a, 'quantity')!, '2');
    h.type(h.gridCell('yeniSatirlar', a, 'unitPrice')!, '100.10');
    h.type(h.gridCell('yeniSatirlar', a, 'discountAmount')!, '10');
    h.type(h.gridCell('yeniSatirlar', a, 'vatRate')!, '20');
    await waitFor(() => expect(h.gridCell('yeniSatirlar', a, 'total')!.value).toBe('228.24'), T);
    expect(h.gridCell('yeniSatirlar', a, 'subtotal')!.value).toBe('200.2');
    expect(h.gridCell('yeniSatirlar', a, 'taxAmount')!.value).toBe('38.04');
    expect(h.gridCell('yeniSatirlar', a, 'lineNumber')!.value).toBe('1');

    // Satır 2: mal kabul satırı seçimi açıklama, miktar, birim ve birim maliyeti doldurur; 4 × 12.5 = 50, KDV %20 → 10, toplam 60.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Satır ekle' }));
    const b = lineKey('yeniSatirlar');
    await h.pick(h.gridCell('yeniSatirlar', b, 'standalonePurchaseReceiptLineId')!, 'MK-0007');
    await waitFor(() => expect(h.gridCell('yeniSatirlar', b, 'description')!.value).toBe('Koli 40x30'), T);
    expect(h.gridCell('yeniSatirlar', b, 'quantity')!.value).toBe('4');
    expect(h.gridCell('yeniSatirlar', b, 'unitCode')!.value).toBe('ADET');
    expect(h.gridCell('yeniSatirlar', b, 'unitPrice')!.value).toBe('12.5');
    h.type(h.gridCell('yeniSatirlar', b, 'vatRate')!, '20');

    // Satır 3: elle; 3 × 0.1 = 0.3 (kayan nokta 0.30000000000000004 yuvarlanır), KDV %18 → 0.05, toplam 0.35; iskonto boş.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Satır ekle' }));
    const c = lineKey('yeniSatirlar');
    h.type(h.gridCell('yeniSatirlar', c, 'description')!, 'Kargo');
    await h.pick(h.gridCell('yeniSatirlar', c, 'expenseAccountId')!, '770.01');
    h.type(h.gridCell('yeniSatirlar', c, 'description')!, 'Kargo');
    h.type(h.gridCell('yeniSatirlar', c, 'quantity')!, '3');
    h.type(h.gridCell('yeniSatirlar', c, 'unitPrice')!, '0.1');
    h.type(h.gridCell('yeniSatirlar', c, 'vatRate')!, '18');
    await waitFor(() => expect(h.gridCell('yeniSatirlar', c, 'total')!.value).toBe('0.35'), T);
    expect(h.gridCell('yeniSatirlar', c, 'lineNumber')!.value).toBe('3');
    // Kapalı gider hesabı seçenek dışıdır.
    fireEvent.click(h.gridCell('yeniSatirlar', c, 'expenseAccountId')!);
    await screen.findByRole('option', { name: /^770\.01/ }, T);
    expect(screen.queryByRole('option', { name: /^770\.99/ })).toBeNull();
    fireEvent.keyDown(h.gridCell('yeniSatirlar', c, 'expenseAccountId')!, { key: 'Escape' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Taslağı kaydet' }));
    await waitFor(() => expect(h.sent(BASE)).toHaveLength(1), T);
    const body = h.bodyOf(h.sent(BASE)[0]);
    expect(body).toEqual({
      requestId: expect.stringMatching(GUID), supplierId: SUP, invoiceNumber: 'HZM-2026-0042', invoiceDate: today(), dueDate: '2026-12-31',
      currencyCode: 'TRY', notes: null, subtotal: 250.5, discountTotal: 10, taxTotal: 48.09, grandTotal: 288.59,
      lines: [
        { lineNumber: 1, description: 'Genel yönetim giderleri', quantity: 2, unitPrice: 100.1, subtotal: 200.2, discountAmount: 10, taxAmount: 38.04, total: 228.24,
          expenseAccountId: GL1, vatRate: 20 },
        { lineNumber: 2, description: 'Koli 40x30', quantity: 4, unitCode: 'ADET', unitPrice: 12.5, subtotal: 50, taxAmount: 10, total: 60, vatRate: 20,
          standalonePurchaseReceiptLineId: RL1 },
        { lineNumber: 3, description: 'Kargo', quantity: 3, unitPrice: 0.1, subtotal: 0.3, taxAmount: 0.05, total: 0.35, expenseAccountId: GL1, vatRate: 18 },
      ],
    });
    // Muhasebeleştirme tutarlılığı: genel toplam = ara toplam − iskonto + KDV.
    expect(Number(body.subtotal) - Number(body.discountTotal) + Number(body.taxTotal)).toBeCloseTo(Number(body.grandTotal), 10);
    // Mal kabul satırı seçenekleri tedarikçi ve fatura tarihiyle okunur.
    const receipts = new URLSearchParams(h.gets(`${BASE}/receipts`).at(-1)!.url.split('?')[1]);
    expect([receipts.get('supplierId'), receipts.get('invoiceDate')]).toEqual([SUP, today()]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni bağımsız alış faturası taslağı' })).toBeNull(), T);
  });

  it('Düzenle fills the header and lines from the draft and puts all lines back with expectedRowVersion and renumbered lines', async () => {
    h.setup(respond);
    await h.select('HZM-0001');
    await waitFor(() => expect(h.gets(`${BASE}/${D1}`).length).toBeGreaterThan(0), T);
    await h.ready('open');
    fireEvent.click(h.command('open'));
    const dialog = await screen.findByRole('dialog', { name: /Fatura taslağı · HZM-0001/ }, T);
    await waitFor(() => expect(h.gridCell('duzenleSatirlar', 'dolu-2', 'description')?.value).toBe('Yol'), T);
    await waitFor(() => expect(h.input('duzenleFaturaNo').value).toBe('HZM-0001'), T);
    expect(h.input('duzenleNotlar').value).toBe('Kasım');
    // Sunucu satır numarası (5) yerine gönderim sırası (2) kullanılır; formüller yeniden hesaplanır.
    expect(h.gridCell('duzenleSatirlar', 'dolu-2', 'lineNumber')!.value).toBe('2');
    h.type(h.gridCell('duzenleSatirlar', 'dolu-2', 'quantity')!, '3');
    await waitFor(() => expect(h.gridCell('duzenleSatirlar', 'dolu-2', 'total')!.value).toBe('45'), T);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri kaydet' }));
    await waitFor(() => expect(h.sent(`${BASE}/${D1}`)).toHaveLength(1), T);
    const call = h.sent(`${BASE}/${D1}`)[0];
    expect(call.method).toBe('PUT');
    expect(h.bodyOf(call)).toEqual({
      expectedRowVersion: 'AAAAAAAAB9E=', supplierId: SUP, invoiceNumber: 'HZM-0001', invoiceDate: '2026-11-10', dueDate: '2026-12-10', currencyCode: 'TRY',
      notes: 'Kasım', subtotal: 145, discountTotal: 0, taxTotal: 20, grandTotal: 165,
      lines: [
        { lineNumber: 1, description: 'Danışmanlık', quantity: 1, unitCode: 'SAAT', unitPrice: 100, subtotal: 100, discountAmount: 0, taxAmount: 20, total: 120,
          expenseAccountId: GL1, vatRate: 20 },
        { lineNumber: 2, description: 'Yol', quantity: 3, unitCode: 'ADET', unitPrice: 15, subtotal: 45, discountAmount: 0, taxAmount: 0, total: 45,
          expenseAccountId: GL1, vatRate: 0 },
      ],
    });
  });

  it('Muhasebeleştir asks first and posts the draft; a posted draft cannot be edited or posted', async () => {
    h.setup(respond);
    await h.select('HZM-0001');
    fireEvent.click(await h.menuItem(/^Muhasebeleştir/));
    const confirm = await screen.findByRole('alertdialog', {}, T);
    expect(confirm.textContent).toContain('HZM-0001 taslağı muhasebeleştirilsin mi?');
    expect(h.writes()).toEqual([]);
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `${BASE}/${D1}/post` });
    expect(h.bodyOf(h.writes()[0])).toEqual({});
    expect(await screen.findByText(/^Fatura taslağı muhasebeleştirildi/, {}, T)).toBeTruthy();

    await h.select('HZM-0002');
    await waitFor(() => expect(h.command('open').getAttribute('aria-disabled')).toBe('true'), T);
    expect((await h.menuItem(/^Muhasebeleştir/)).getAttribute('aria-disabled')).toBe('true');
  });

  it('Eski ekranda aç opens the legacy drafts screen', async () => {
    h.setup(respond);
    await h.cell('HZM-0001');
    fireEvent.click(await h.menuItem(/^Eski ekranda aç/));
    await waitFor(() => expect(h.state.navigations).toHaveLength(1), T);
    expect(h.state.navigations[0]).toMatchObject({ page: KEY, legacy: true });
  });
});
