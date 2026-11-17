import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import { localDateString } from '../dateUtils';
import { PurchaseReceiptsScreen } from '../PurchaseReceiptsScreen';
import PurchaseDeliveryNotesPage from '../PurchaseDeliveryNotesPage';
import SalesReturnsPage from '../SalesReturnsPage';
import PurchaseReturnsPage from '../PurchaseReturnsPage';

/*
 * Satınalma İrsaliyeleri ve Mal kabulleri (Faz 4 Task 4): liste tipi, sağ panel, belge ekranı, irsaliye oluşturma
 * görünümü (kayıt / bağla / çöz gövdeleri aynı) ve İadeler ipucu.
 */

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const receipt = (id: string, code: string, orderId: string, orderCode: string, status: 'Posted' | 'Voided') => ({
  id, code, purchaseOrderId: orderId, purchaseOrderCode: orderCode, warehouseId: 'w1', warehouseName: 'Ana depo',
  receiptDate: '2026-11-04', status, lineCount: 1, createdAt: '2026-11-04T10:00:00Z',
});
const invoice = {
  id: 'pi1', code: 'AF-1', purchaseReceiptId: 'r1', receiptCode: 'MK-1', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-1',
  supplierId: 's1', supplierName: 'Ege Ambalaj', invoiceDate: '2026-11-05', dueDate: '2026-12-05', currencyCode: 'TRY',
  status: 'Posted', grandTotal: 1200, paidAmount: 0, outstandingAmount: 1200, lineCount: 1, createdAt: '2026-11-05',
};
const receiptLine = { orderLineNumber: 1, stockItemId: 'st1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 4 };
const orderDetail = (id: string, code: string, receipts: unknown[]) => ({
  id, code, supplierId: 's1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', status: 'PartiallyReceived', currencyCode: 'TRY',
  grandTotal: 1200, subtotal: 1000, discountTotal: 0, taxTotal: 200, notes: null, createdAt: '2026-11-01', customFields: [],
  lines: [{ lineNumber: 1, stockItemId: 'st1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 10, unitPrice: 100, discountPercent: 0, vatPercent: 20, lineSubtotal: 1000, discountAmount: 0, taxAmount: 200, lineTotal: 1200, receivedQuantity: 4, remainingQuantity: 6 }],
  receipts,
});
const receipts = [
  receipt('r1', 'MK-1', 'po1', 'SA-1', 'Posted'),
  receipt('r2', 'MK-2', 'po1', 'SA-1', 'Voided'),
  receipt('r3', 'MK-3', 'po2', 'SA-2', 'Posted'),
];
const po1 = orderDetail('po1', 'SA-1', [
  { ...receipts[0], lines: [receiptLine], invoice, customFields: [] },
  { ...receipts[1], lines: [receiptLine], invoice: null, customFields: [] },
  { ...receipt('r4', 'MK-4', 'po1', 'SA-1', 'Posted'), lines: [receiptLine], invoice: null, customFields: [] },
]);
const po2 = orderDetail('po2', 'SA-2', [{ ...receipts[2], lines: [receiptLine], invoice: null, customFields: [] }]);
const note = (id: string, number: string, receiptId: string | null, receiptCode: string | null) => ({
  id, documentNumber: number, documentDate: '2026-11-03', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-1', supplierName: 'Ege Ambalaj',
  purchaseReceiptId: receiptId, purchaseReceiptCode: receiptCode, lineCount: 1,
});
const notes = [note('n1', 'IRS-1', 'r1', 'MK-1'), note('n2', 'IRS-2', null, null)];

/** Overrides per test (e.g. a tenant layout). */
const overrides = new Map<string, () => unknown>();

function respond(url: string): unknown {
  const path = url.split('?')[0];
  const override = overrides.get(path);
  if (override) return override();
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/finance/accounts') return [];
  if (path === '/api/purchasing/receipts/') return page(receipts);
  if (path === '/api/purchasing/orders/po1') return po1;
  if (path === '/api/purchasing/orders/po2') return po2;
  if (path === '/api/purchasing/orders/') return page([{ id: 'po1', code: 'SA-1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', status: 'PartiallyReceived', lineCount: 1 }]);
  if (path === '/api/purchasing/invoices/pi1') return { ...invoice, subtotal: 1000, discountTotal: 0, taxTotal: 200, providerInvoiceUuid: null, providerScenario: null, providerInvoiceTypeCode: null, providerSenderAlias: null, lines: [], payments: [], returns: [] };
  if (path === '/api/purchasing/delivery-notes/') return page(notes);
  if (path === '/api/purchasing/delivery-notes/orders/po1') return notes;
  if (path === '/api/purchasing/delivery-notes/n1') return { ...notes[0], lines: [{ orderLineNumber: 1, unitCode: 'ADET', quantity: 4 }] };
  if (path === '/api/purchasing/delivery-notes/n2') return { ...notes[1], lines: [{ orderLineNumber: 1, unitCode: 'ADET', quantity: 2 }] };
  if (path === '/api/sales/returns/') return page([]);
  if (path === '/api/purchasing/returns/') return page([]);
  return page([]);
}

const apiMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../authApi')>()), authenticatedFetch: fetchMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string) => respond(url));
  fetchMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) =>
    new Response(JSON.stringify(init?.method === 'POST' ? {} : respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  fetchMock.mockClear();
  overrides.clear();
  sessionStorage.clear();
  localStorage.clear();
});

function renderScreen(view: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
const receiptsScreen = () => <PurchaseReceiptsScreen token="t" role="TenantAdmin" warehouses={[]} customers={[]} stockItems={[]} />;

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? command(id).getAttribute('aria-label') ?? '';
function menuItems() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
async function runMenuItem(label: string) {
  fireEvent.click(command('more'));
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((entry) => entry.textContent?.includes(label))!;
  await act(async () => {
    fireEvent.click(item);
  });
}
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getByText(code, { exact: false }).closest('tr')!;
const panel = () => document.querySelector<HTMLElement>('aside.sales-ld')!;
const togglePanel = () => fireEvent.keyDown(window, { key: '.', ctrlKey: true });
const tagOf = (tr: HTMLElement) => tr.querySelector<HTMLElement>('.nx-status-tag');
const chain = () => Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *')).map((part) => part.textContent?.replace(/\s+/g, ' ').trim()).join(' '),
  );
const apiCalls = (path: string) => apiMock.mock.calls.filter(([url]) => url === path).length;
const posts = () =>
  fetchMock.mock.calls
    .filter(([, , init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([url, , init]) => ({ url, body: (init as RequestInit).body ? JSON.parse(String((init as RequestInit).body)) : undefined }));

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('Mal kabulleri list', () => {
  it('list type: same list call, tags, page card, nothing current, Sil kapalı, siparişsiz mal kabul formu', async () => {
    renderScreen(receiptsScreen());
    await settle();
    expect(apiCalls('/api/purchasing/receipts/?page=1&pageSize=25')).toBe(1);
    expect(screen.getByRole('heading', { name: /Mal kabulleri/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(tagOf(row('MK-1'))?.textContent).toBe('Kabul edildi');
    expect(tagOf(row('MK-1'))?.className).toContain('is-ok');
    expect(tagOf(row('MK-2'))?.className).toContain('is-off');
    expect(cards()).toEqual(['İptal 1 bu sayfa']);
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toContain('Önce bir kayıt seçin');
    expect(enabled('delete')).toBe(false);
    expect(screen.getByText('Siparişsiz satın alma mal kabulü')).toBeTruthy();
    expect(document.querySelector('.doc-surface')).toBeNull();
  });

  it('the search filters the loaded page ("bu sayfa"); no server search', async () => {
    renderScreen(receiptsScreen());
    await settle();
    const search = screen.getByPlaceholderText('Bu sayfada ara: mal kabul, sipariş veya depo');
    fireEvent.change(search, { target: { value: 'MK-3' } });
    await settle(450);
    expect(within(grid()).queryByText('MK-1')).toBeNull();
    expect(within(grid()).getByText('MK-3')).toBeTruthy();
    expect(apiMock.mock.calls.some(([url]) => String(url).includes('q='))).toBe(false);
  });

  it('a row click makes it current; the panel shows order, warehouse, invoice and the chain from the order detail', async () => {
    renderScreen(receiptsScreen());
    await settle();
    togglePanel();
    fireEvent.click(row('MK-1'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    expect(document.querySelector('.doc-surface')).toBeNull();
    expect(apiCalls('/api/purchasing/orders/po1')).toBeGreaterThan(0);
    expect(chain()).toEqual(['SA-1 Satınalma siparişi', 'MK-1 Bu mal kabul', 'AF-1 Alış faturası']);
    const facts = panel().textContent ?? '';
    expect(facts).toContain('Ana depo');
    expect(facts).toContain('AF-1');
    expect(enabled('open')).toBe(true);
    expect(reason('delete')).toContain('Kabul edilmiş belge silinemez');
  });

  it('a double-click opens the receipt document (order call as today); Alış faturasını aç is in İşlemler', async () => {
    renderScreen(receiptsScreen());
    await settle();
    fireEvent.doubleClick(row('MK-1'));
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    expect(apiCalls('/api/purchasing/orders/po1')).toBe(1);
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    expect(surface.querySelector('.doc-flow [aria-current="step"]')?.textContent).toContain('Kabul edildi');
    expect(within(surface).getByRole('table', { name: 'Mal kabul satırları' }).textContent).toContain('Koli 40x30');
    expect(Array.from(surface.querySelectorAll('header button')).map((button) => button.textContent?.trim())).not.toContain('Alış faturasını aç');
    expect(menuItems()).toContain('Alış faturasını aç');
    expect(enabled('filter')).toBe(false);
    expect(reason('delete')).toContain('Kabul edilmiş belge silinemez');
    await runMenuItem('Alış faturasını aç');
    await waitFor(() => expect(apiCalls('/api/purchasing/invoices/pi1')).toBeGreaterThan(0));
  });

  it('while a receipt is open, the hidden order-less form gives the bar no Kaydet / Temizle and Ctrl+S sends nothing; its draft stays', async () => {
    renderScreen(receiptsScreen());
    await settle();
    // The order-less form owns Kaydet while the list shows.
    await waitFor(() => expect(enabled('save')).toBe(true));
    expect(menuItems()).toContain('Temizle');
    fireEvent.change(screen.getByPlaceholderText('MK-2026-001'), { target: { value: 'MK-TASLAK' } });
    fireEvent.doubleClick(row('MK-1'));
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    expect(enabled('save')).toBe(false);
    expect(menuItems()).not.toContain('Temizle');
    expect(menuItems()).not.toContain('Kaydet ve Yeni');
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    });
    await settle();
    expect(apiMock.mock.calls.some(([, , init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeNull());
    expect((screen.getByPlaceholderText('MK-2026-001') as HTMLInputElement).value).toBe('MK-TASLAK');
    await waitFor(() => expect(enabled('save')).toBe(true));
    expect(menuItems()).toContain('Temizle');
  });

  it('a voided receipt has İptal as its end state and no invoice command', async () => {
    renderScreen(receiptsScreen());
    await settle();
    fireEvent.doubleClick(row('MK-2'));
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    expect(document.querySelector('.doc-flow [aria-current="step"]')?.textContent).toContain('İptal');
    expect(menuItems()).not.toContain('Alış faturasını aç');
    expect(reason('delete')).toContain('Mal kabul kaydı silinemez');
  });
});

describe('Satınalma İrsaliyeleri', () => {
  it('list type: derived tag (Mal kabul eşleşti ok / Bağlantısı yok warn), no amounts, page card', async () => {
    renderScreen(<PurchaseDeliveryNotesPage token="t" />);
    await settle();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/purchasing/delivery-notes/?page=1&pageSize=25')).toBe(true);
    expect(tagOf(row('IRS-1'))?.textContent).toBe('Mal kabul eşleşti');
    expect(tagOf(row('IRS-1'))?.className).toContain('is-ok');
    expect(row('IRS-1').textContent).toContain('MK-1');
    expect(tagOf(row('IRS-2'))?.textContent).toBe('Bağlantısı yok');
    expect(tagOf(row('IRS-2'))?.className).toContain('is-warn');
    expect(cards()).toEqual(['Bağlantısı yok 1 bu sayfa']);
    expect(grid().textContent).not.toMatch(/TRY|Tutar/);
    // The order workspace is not on the list any more; it opens with Yeni.
    expect(screen.queryByLabelText('Satın alma siparişlerinde ara')).toBeNull();
  });

  it('a tenant layout without the receipt column keeps the derived tag (its own Durum column)', async () => {
    overrides.set('/api/screen-views/purchase-delivery-notes/active', () => ({
      fields: [
        { key: 'documentNumber', label: 'Tedarikçi irsaliye no', visible: true, position: 0 },
        { key: 'supplierName', label: 'Tedarikçi', visible: true, position: 1 },
        { key: 'purchaseReceiptCode', label: 'Mal kabul', visible: false, position: 2 },
      ],
    }));
    renderScreen(<PurchaseDeliveryNotesPage token="t" />);
    await settle();
    await waitFor(() => expect(within(grid()).queryByText('Mal kabul')).toBeNull());
    expect(tagOf(row('IRS-1'))?.textContent).toBe('Mal kabul eşleşti');
    expect(tagOf(row('IRS-2'))?.className).toContain('is-warn');
    expect(within(grid()).getByText('Durum')).toBeTruthy();
  });

  it('the panel and the document: chain from the row, lines from the note detail, no status flow', async () => {
    renderScreen(<PurchaseDeliveryNotesPage token="t" />);
    await settle();
    togglePanel();
    fireEvent.click(row('IRS-1'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    expect(chain()).toEqual(['SA-1 Satınalma siparişi', 'IRS-1 Bu irsaliye', 'MK-1 Mal kabul']);
    expect(menuItems()).toContain('Siparişi aç');
    fireEvent.doubleClick(row('IRS-1'));
    await waitFor(() => expect(document.querySelector('.doc-surface .dd-box')).not.toBeNull());
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    expect(surface.querySelector('.doc-flow')).toBeNull();
    expect(surface.textContent).toContain('Mal kabul eşleşti');
    await waitFor(() => expect(surface.textContent).toContain('4 ADET'));
    expect(enabled('filter')).toBe(false);
    expect(enabled('delete')).toBe(false);
  });

  it('Yeni opens the create view; Enter in the order search does not save; Kaydet posts the same body', async () => {
    renderScreen(<PurchaseDeliveryNotesPage token="t" />);
    await settle();
    await act(async () => {
      fireEvent.click(command('new'));
    });
    const search = await screen.findByLabelText('Satın alma siparişlerinde ara');
    expect(document.querySelector('.record-form.doc-form')).not.toBeNull();
    expect(enabled('save')).toBe(false);
    fireEvent.keyDown(search, { key: 'Enter' });
    await settle();
    expect(posts()).toEqual([]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sipariş' }), { target: { value: 'po1' } });
    await waitFor(() => expect(screen.getByLabelText('STK-1 irsaliye miktarı')).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Tedarikçi irsaliye numarası/), { target: { value: 'IRS-9' } });
    fireEvent.change(screen.getByLabelText('STK-1 irsaliye miktarı'), { target: { value: '4' } });
    await waitFor(() => expect(enabled('save')).toBe(true));
    await act(async () => {
      fireEvent.click(command('save'));
    });
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toEqual({
      url: '/api/purchasing/delivery-notes/orders/po1',
      body: { documentNumber: 'IRS-9', documentDate: localDateString(), lines: [{ orderLineNumber: 1, quantity: 4, unitCode: 'ADET' }], purchaseReceiptId: null },
    });
    await waitFor(() => expect(screen.getByText('İrsaliye kaydedildi; stok girişi mal kabul işleminde yapılır.')).toBeTruthy());
  });

  it('link and unlink in the create view send the same requests and do not save the note', async () => {
    renderScreen(<PurchaseDeliveryNotesPage token="t" />);
    await settle();
    togglePanel();
    fireEvent.click(row('IRS-2'));
    // İşlemler › Siparişi aç opens the create view on the note's order.
    await runMenuItem('Siparişi aç');
    await waitFor(() => expect(screen.getByLabelText('IRS-2 mal kabul seçin')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('IRS-2 mal kabul seçin'), { target: { value: 'r4' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bağla$/ }));
    });
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toEqual({ url: '/api/purchasing/delivery-notes/n2/link-receipt', body: { purchaseReceiptId: 'r4' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bağlantıyı kaldır' })).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kaldır' }));
    });
    await waitFor(() => expect(posts().length).toBe(2));
    expect(posts()[1]).toEqual({ url: '/api/purchasing/delivery-notes/n1/unlink-receipt', body: undefined });
    expect(posts().some((call) => call.url === '/api/purchasing/delivery-notes/orders/po1')).toBe(false);
  });
});

describe('İadeler', () => {
  it('shows where a return is created, on both sides', async () => {
    renderScreen(<SalesReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(screen.getByText('İade, fatura detayından oluşturulur')).toBeTruthy();
    cleanup();
    renderScreen(<PurchaseReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(screen.getByText('İade, fatura detayından oluşturulur')).toBeTruthy();
  });
});

describe('English', () => {
  it('has an entry for every new text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Mal kabul eşleşti', 'Bağlantısı yok', 'Bu mal kabul', 'Bu irsaliye', 'Mal kabul özeti', 'Tedarikçi irsaliyesi özeti',
      'Özetini görmek için listeden bir mal kabul seçin.', 'Bu sayfada ara: mal kabul, sipariş veya depo',
      'Bu sayfada aramanızla eşleşen mal kabul yok.', 'Kabul edilmiş belge silinemez — iptal sipariş belgesinden yapılır',
      'Mal kabul kaydı silinemez', 'Mal kabul bulunamadı.', 'Mal kabul bilgileri', 'Mal kabul satırları', 'Kabul miktarı',
      'MK-1 mal kabul ayrıntılarını aç', 'IRS-1 irsaliye ayrıntılarını aç', 'Yeni tedarikçi irsaliyesi', 'Önce bir sipariş seçin',
      "İrsaliye kaydı silinemez — mal kabul bağlantısı İşlemler › Siparişi aç'ta yönetilir", 'Sipariş satırı', 'Henüz faturalanmadı',
      'Satın alma siparişi', 'Belge Kimliği', 'İade, fatura detayından oluşturulur', 'Bu siparişin irsaliyeleri',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});
