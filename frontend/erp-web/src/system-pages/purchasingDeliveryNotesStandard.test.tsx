import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from './purchasingDeliveryNotesOperations.fixture.json';
import { T, createHarness, page } from './purchasingStandardHarness';

// "Gelen irsaliyeler" standart tanımı (sales-purchase-delivery-notes.json, v2): liste, salt okunur belge, bağlı kayıtlara geçiş,
// siparişin irsaliyelenmemiş kalanından yeni irsaliye (fill + skipWhenZero) ve mal kabul bağlama / bağlantı kaldırma.

vi.mock('../erpApi', () => ({ api: vi.fn() }));

const KEY = 'sales-purchase-delivery-notes';
const N1 = 'cccccccc-0000-0000-0000-000000000001';
const N2 = 'cccccccc-0000-0000-0000-000000000002';
const PO = '55555555-0000-0000-0000-000000000001';
const R1 = '66666666-0000-0000-0000-000000000001';
const R2 = '66666666-0000-0000-0000-000000000002';
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const note = { id: N1, documentNumber: 'IRS-0001', documentDate: '2026-11-03', purchaseOrderId: PO, purchaseOrderCode: 'SA-0001', supplierName: 'Ege Ambalaj',
  purchaseReceiptId: R1, purchaseReceiptCode: 'MK-0001', lineCount: 1, currencyCode: 'TRY', pricedGrandTotal: 480, pricingState: 'PartlyFree' };
const unlinked = { ...note, id: N2, documentNumber: 'IRS-0002', purchaseReceiptId: null, purchaseReceiptCode: null };
const receipt = (id: string, code: string, status: string) => ({ id, code, purchaseOrderId: PO, purchaseOrderCode: 'SA-0001', warehouseId: 'w1', warehouseName: 'Ana depo',
  receiptDate: '2026-11-04', status, lineCount: 1, invoice: null });
const order = { id: PO, code: 'SA-0001', supplierId: 's1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', currencyCode: 'TRY', status: 'PartiallyReceived' };
const noteLines = [
  { orderLineNumber: 1, stockItemId: 'st1', stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', orderedQuantity: 10, notedQuantity: 4, remainingQuantity: 6 },
  { orderLineNumber: 2, stockItemId: 'st2', stockCode: 'AMB-2', stockName: 'Bant', unitCode: 'ADET', orderedQuantity: 5, notedQuantity: 5, remainingQuantity: 0 },
  { orderLineNumber: 3, stockItemId: 'st3', stockCode: 'AMB-3', stockName: 'Streç', unitCode: 'RULO', orderedQuantity: 5, notedQuantity: 0, remainingQuantity: 5 },
];

function respond(path: string, method: string): unknown {
  if (method === 'GET') {
    if (path === '/api/purchasing/delivery-notes') return page([note, unlinked]);
    if (path === `/api/purchasing/delivery-notes/${N1}`) return { ...note, lines: [{ orderLineNumber: 1, unitCode: 'ADET', quantity: 4 }] };
    if (path === `/api/purchasing/delivery-notes/${N2}`) return { ...unlinked, lines: [{ orderLineNumber: 1, unitCode: 'ADET', quantity: 4 }] };
    if (path === '/api/purchasing/orders') return page([order]);
    if (path === `/api/purchasing/orders/${PO}`) return { ...order, lines: [], receipts: [receipt(R1, 'MK-0001', 'Posted'), receipt(R2, 'MK-0002', 'Posted'), receipt('rv', 'MK-0003', 'Voided')] };
    if (path === `/api/purchasing/delivery-notes/orders/${PO}/lines`) return noteLines;
    if (path === `/api/purchasing/delivery-notes/orders/${PO}`) return [note];
  }
  if (method === 'POST') {
    if (path === `/api/purchasing/delivery-notes/orders/${PO}`) return { ...unlinked, id: 'cccccccc-0000-0000-0000-000000000009', documentNumber: 'IRS-0009' };
    if (/^\/api\/purchasing\/delivery-notes\/[^/]+\/(link|unlink)-receipt$/.test(path)) return {};
  }
  return undefined;
}

const h = createHarness(KEY, catalog);
beforeEach(h.before);
afterEach(() => h.after(['sales-purchasing', 'sales-purchase-receipts']));

describe('Gelen irsaliyeler standart tanımı', { timeout: 60000 }, () => {
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

  it('Yeni irsaliye fills the order remaining lines; skipWhenZero and an edit shape the posted lines', async () => {
    h.setup(respond);
    await h.cell('IRS-0001');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Siparişten tedarikçi irsaliyesi' }, T);
    await h.pick(h.input('irsaliyeSiparisi'), 'SA-0001');
    await waitFor(() => expect(h.gridCell('irsaliyeSatirlari', 'dolu-1', 'quantity')?.value).toBe('6'), T);
    expect(h.gridCell('irsaliyeSatirlari', 'dolu-2', 'quantity')!.value).toBe('0');
    expect(h.gridCell('irsaliyeSatirlari', 'dolu-3', 'notedQuantity')!.value).toBe('0');
    expect(await within(dialog).findByText(/Gönderilecek satır: 2\./, {}, T)).toBeTruthy();
    // Siparişin önceki irsaliyeleri pencerede listelenir.
    expect(await within(dialog).findByText('IRS-0001', { selector: 'td, td *' }, T)).toBeTruthy();
    h.type(h.input('belgeNo'), 'IRS-2026-0042');
    h.type(h.gridCell('irsaliyeSatirlari', 'dolu-3', 'quantity')!, '3');
    fireEvent.click(within(dialog).getByRole('button', { name: 'İrsaliyeyi kaydet' }));
    const url = `/api/purchasing/delivery-notes/orders/${PO}`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(url)[0])).toEqual({
      documentNumber: 'IRS-2026-0042', documentDate: today(), purchaseReceiptId: null,
      lines: [{ orderLineNumber: 1, quantity: 6, unitCode: 'ADET' }, { orderLineNumber: 3, quantity: 3, unitCode: 'RULO' }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Siparişten tedarikçi irsaliyesi' })).toBeNull(), T);
  });

  it('taslak 20: the list shows the pricing state; a Bedelsiz line and a typed price go with the posted lines', async () => {
    h.setup(respond);
    await h.cell('IRS-0001');
    expect(screen.getAllByText('Kısmen bedelsiz').length).toBeGreaterThan(0);
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Siparişten tedarikçi irsaliyesi' }, T);
    await h.pick(h.input('irsaliyeSiparisi'), 'SA-0001');
    await waitFor(() => expect(h.gridCell('irsaliyeSatirlari', 'dolu-1', 'quantity')?.value).toBe('6'), T);
    h.type(h.input('belgeNo'), 'IRS-2026-0043');
    // Önce yazılan fiyat bedelsiz işaretlenince silinir; fiyat hücreleri kilitli "—" olur (lockColumnsWhen).
    h.type(h.gridCell('irsaliyeSatirlari', 'dolu-1', 'unitPrice')!, '9');
    fireEvent.click(h.gridCell('irsaliyeSatirlari', 'dolu-1', 'isFreeOfCharge')!);
    await waitFor(() => expect(h.gridCell('irsaliyeSatirlari', 'dolu-1', 'unitPrice')).toBeNull(), T);
    expect([...dialog.querySelectorAll('[data-locked]')].map((cell) => cell.getAttribute('data-locked'))).toEqual(['unitPrice', 'discountPercent', 'vatPercent']);
    h.type(h.gridCell('irsaliyeSatirlari', 'dolu-3', 'quantity')!, '3');
    h.type(h.gridCell('irsaliyeSatirlari', 'dolu-3', 'unitPrice')!, '12');
    fireEvent.click(within(dialog).getByRole('button', { name: 'İrsaliyeyi kaydet' }));
    const url = `/api/purchasing/delivery-notes/orders/${PO}`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    const lines = h.bodyOf(h.sent(url)[0]).lines as Array<Record<string, unknown>>;
    expect(lines[0]).toMatchObject({ orderLineNumber: 1, quantity: 6, isFreeOfCharge: true });
    expect(['unitPrice', 'discountPercent', 'vatPercent'].filter((code) => code in lines[0])).toEqual([]);
    expect(lines[1]).toMatchObject({ orderLineNumber: 3, quantity: 3, unitPrice: 12 });
  });

  it('Yeni irsaliye can name a posted receipt of the order', async () => {
    h.setup(respond);
    await h.cell('IRS-0001');
    await h.ready('new');
    fireEvent.click(h.command('new'));
    const dialog = await screen.findByRole('dialog', { name: 'Siparişten tedarikçi irsaliyesi' }, T);
    await h.pick(h.input('irsaliyeSiparisi'), 'SA-0001');
    await waitFor(() => expect(h.gridCell('irsaliyeSatirlari', 'dolu-1', 'quantity')?.value).toBe('6'), T);
    const select = await waitFor(() => { const element = h.input('irsaliyeKabulu') as unknown as HTMLSelectElement; expect(element).toBeTruthy(); return element; }, T);
    await waitFor(() => expect([...select.options].map((option) => option.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('MK-0002')])), T);
    expect([...select.options].some((option) => option.textContent?.includes('MK-0003'))).toBe(false);
    fireEvent.change(select, { target: { value: R2 } });
    h.type(h.input('belgeNo'), 'IRS-43');
    fireEvent.click(within(dialog).getByRole('button', { name: 'İrsaliyeyi kaydet' }));
    const url = `/api/purchasing/delivery-notes/orders/${PO}`;
    await waitFor(() => expect(h.sent(url)).toHaveLength(1), T);
    expect(h.bodyOf(h.sent(url)[0])).toMatchObject({ documentNumber: 'IRS-43', purchaseReceiptId: R2 });
  });

  it('Mal kabul bağla posts the picked posted receipt of the note order', async () => {
    h.setup(respond);
    await h.select('IRS-0002');
    fireEvent.click(await h.menuItem(/^Mal kabul bağla$/));
    const dialog = await screen.findByRole('dialog', { name: /Mal kabul bağla · IRS-0002/ }, T);
    const select = h.input('baglaKabulu') as unknown as HTMLSelectElement;
    await waitFor(() => expect([...select.options].some((option) => option.value === R2)).toBe(true), T);
    fireEvent.change(select, { target: { value: R2 } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0].url).toBe(`/api/purchasing/delivery-notes/${N2}/link-receipt`);
    expect(h.bodyOf(h.writes()[0])).toEqual({ purchaseReceiptId: R2 });
  });

  it('Mal kabul bağlantısını kaldır asks first and posts the unlink with an empty body', async () => {
    h.setup(respond);
    await h.select('IRS-0001');
    fireEvent.click(await h.menuItem(/^Mal kabul bağlantısını kaldır/));
    const confirm = await screen.findByRole('alertdialog', {}, T);
    expect(confirm.textContent).toContain('IRS-0001 irsaliyesinin MK-0001 mal kabul bağlantısı kaldırılsın mı?');
    expect(h.writes()).toEqual([]);
    await h.answer('Onayla');
    await waitFor(() => expect(h.writes()).toHaveLength(1), T);
    expect(h.writes()[0]).toMatchObject({ method: 'POST', url: `/api/purchasing/delivery-notes/${N1}/unlink-receipt` });
    // Gövdesiz işlem: çalışma zamanı boş nesne gönderir.
    expect(h.bodyOf(h.writes()[0])).toEqual({});
    expect(await screen.findByText(/^Mal kabul bağlantısı kaldırıldı\./, {}, T)).toBeTruthy();
  });

  it('link is disabled for a linked note and unlink for an unlinked one', async () => {
    h.setup(respond);
    await h.select('IRS-0001');
    expect((await h.menuItem(/^Mal kabul bağla$/)).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(h.command('more'));
    await h.select('IRS-0002');
    expect((await h.menuItem(/^Mal kabul bağlantısını kaldır/)).getAttribute('aria-disabled')).toBe('true');
  });
});
