import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import SalesQuotesPage from '../SalesQuotesPage';
import SalesOrdersPage from '../SalesOrdersPage';
import SalesInvoicesPage from '../SalesInvoicesPage';
import SalesDeliveriesScreenPage from '../SalesDeliveriesScreenPage';
import SalesCustomerRequestsPage from '../sales-customer-requests/SalesCustomerRequestsPage';
import SalesReturnsPage from '../SalesReturnsPage';
import PurchaseReturnsPage from '../PurchaseReturnsPage';
import { salesListTag } from './salesListStatus';

const warehouses = [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const line = (n: number, name: string, quantity: number, lineTotal: number) => ({
  id: `l${n}`, lineNumber: n, orderLineNumber: n, stockItemId: `s${n}`, stockCode: `STK-${n}`, stockName: name, unitCode: 'ADET',
  quantity, unitPrice: 10, discountPercent: 0, vatPercent: 20, lineSubtotal: lineTotal, discountAmount: 0, taxAmount: 0, lineTotal,
});
const quote = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `T-${id}`, customerId: 'c1', customerName: 'Acme', quoteDate: '2026-11-01', validUntil: '2026-12-01',
  currencyCode: 'TRY', status, grandTotal: 100, lineCount: 1, createdAt: '2026-11-01', hasSalesOrder: false, revisionNumber: 1, ...extra,
});
const order = (id: string, status: string) => ({
  id, code: `S-${id}`, quoteId: 'q3', quoteCode: 'T-q3', customerId: 'c1', customerName: 'Acme', orderDate: '2026-11-01',
  requestedDeliveryDate: '2026-11-20', currencyCode: 'TRY', status, grandTotal: 250, lineCount: 2, createdAt: '2026-11-01',
});
const invoice = (id: string, status: string, grandTotal: number) => ({
  id, code: `F-${id}`, deliveryId: 'd1', deliveryCode: 'I-d1', orderId: 'o1', orderCode: 'S-o1', customerId: 'c1',
  customerName: 'Acme', invoiceDate: '2026-11-01', currencyCode: 'TRY', status, grandTotal, lineCount: 2, createdAt: '2026-11-01',
});
const invoiceDetail = (id: string, status: string, grandTotal: number) => ({
  ...invoice(id, status, grandTotal), subtotal: 1000, discountTotal: 0, taxTotal: 200, ledgerEntryId: null,
  lines: [line(1, 'Koli 40x30', 50, 600), line(2, 'Streç film', 10, 600)], paidAmount: 400, returnedAmount: 0,
  outstandingAmount: grandTotal - 400,
  collections: [{ id: 'col1', code: 'TAH-1', customerId: 'c1', customerName: 'Acme', salesInvoiceId: id, invoiceCode: `F-${id}`, collectionDate: '2026-11-05', amount: 400, currencyCode: 'TRY', paymentMethod: 'Cash', reference: null, status: 'Posted', createdAt: '2026-11-05' }],
  returns: [], customFields: [],
});
const delivery = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `I-${id}`, orderId: 'o1', orderCode: 'S-o1', warehouseId: 'w1', warehouseName: 'Ana depo', deliveryDate: '2026-11-01',
  status, lineCount: 1, createdAt: '2026-11-01', hasSalesInvoice: false, invoiceStatus: null, invoiceId: null, ...extra,
});
const request = (id: string, status: string) => ({
  id, code: `TLP-${id}`, customerId: 'c1', customerName: 'Acme', requestDate: '2026-11-01', neededByDate: '2026-11-15',
  description: null, status, lineCount: 1, quoteCount: status === 'Quoted' ? 1 : 0, createdAt: '2026-11-01',
});
const salesReturn = (id: string, status: string) => ({
  id, code: `IADE-${id}`, salesInvoiceId: 'i1', invoiceCode: 'F-i1', customerName: 'Acme', warehouseName: 'Ana depo',
  returnDate: '2026-11-02', status, currencyCode: 'TRY', grandTotal: 120, lineCount: 1,
});
const purchaseReturn = {
  id: 'pr1', code: 'AIADE-pr1', purchaseInvoiceId: 'pi1', invoiceCode: 'AF-pi1', supplierName: 'Ege Ambalaj', warehouseName: 'Ana depo',
  returnDate: '2026-11-03', status: 'Posted', currencyCode: 'TRY', grandTotal: 80, lineCount: 1,
};

/** Overrides per test (e.g. a slow detail). */
const overrides = new Map<string, () => unknown>();

function respond(url: string): unknown {
  const path = url.split('?')[0];
  const override = overrides.get(path);
  if (override) return override();
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/' || path === '/api/finance/accounts') return [];
  if (path === '/api/sales/quotes/exchange-rates') return { baseCurrencyCode: 'TRY', rates: [] };
  if (path === '/api/sales/quotes/') return page([quote('q1', 'Draft'), quote('q2', 'Sent'), quote('q3', 'Accepted', { hasSalesOrder: true, salesOrderId: 'o1', salesOrderCode: 'S-o1' })]);
  if (path === '/api/sales/quotes/q3')
    return { ...quote('q3', 'Accepted', { hasSalesOrder: true, salesOrderId: 'o1', salesOrderCode: 'S-o1' }), salesRequestId: 'r1', salesRequestCode: 'TLP-r1', notes: null, deliveryTerms: null, subtotal: 100, discountTotal: 0, taxTotal: 20, lines: [line(1, 'Koli 40x30', 5, 120)], customFields: [] };
  if (path === '/api/sales/orders/') return page([order('o1', 'Open'), order('o2', 'Fulfilled')]);
  if (path === '/api/sales/orders/o1') return { ...order('o1', 'Open'), subtotal: 200, discountTotal: 0, taxTotal: 50, lines: [line(1, 'Koli 40x30', 5, 120)], customFields: [] };
  if (path === '/api/sales/orders/o1/deliveries') return [];
  if (path === '/api/sales/invoices/') return page([invoice('i1', 'Posted', 1200), invoice('i2', 'Voided', 300), invoice('i3', 'Posted', 800)]);
  if (path === '/api/sales/invoices/i1') return invoiceDetail('i1', 'Posted', 1200);
  if (path === '/api/sales/invoices/i2') return invoiceDetail('i2', 'Voided', 300);
  if (path === '/api/sales/invoices/i3') return invoiceDetail('i3', 'Posted', 800);
  if (path === '/api/sales/deliveries/')
    return url.includes('unbilledOnly=true')
      ? page([delivery('d1', 'Posted')])
      : page([delivery('d1', 'Posted'), delivery('d2', 'Voided'), delivery('d3', 'Posted', { hasSalesInvoice: true, invoiceStatus: 'Posted', invoiceId: 'i1' })]);
  if (path === '/api/sales/deliveries/d3') return { ...delivery('d3', 'Posted', { hasSalesInvoice: true, invoiceStatus: 'Posted', invoiceId: 'i1' }), lines: [{ ...line(1, 'Koli 40x30', 7, 0), currencyCode: 'TRY' }] };
  if (path === '/api/sales/requests/') return page([request('r1', 'Quoted'), request('r2', 'Open')]);
  if (path === '/api/sales/requests/r1')
    return { ...request('r1', 'Quoted'), currencyCode: 'TRY', cancelReason: null, lines: [{ lineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 5 }], quotes: [{ id: 'q3', code: 'T-q3', status: 'Accepted', grandTotal: 100, currencyCode: 'TRY', quoteDate: '2026-11-02' }] };
  if (path === '/api/sales/returns/') return page([salesReturn('r1', 'Posted'), salesReturn('r2', 'Voided')]);
  if (path === '/api/sales/returns/r1') return { ...salesReturn('r1', 'Posted'), subtotal: 100, discountTotal: 0, taxTotal: 20, lines: [line(1, 'Koli 40x30', 2, 120)] };
  if (path === '/api/purchasing/returns/') return page([purchaseReturn]);
  if (path === '/api/purchasing/returns/pr1') return { ...purchaseReturn, subtotal: 70, discountTotal: 0, taxTotal: 10, lines: [line(1, 'Streç film', 1, 80)] };
  return page([]);
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string) => respond(url));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
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

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
const reason = (id: string) => command(id).getAttribute('title') ?? command(id).getAttribute('aria-label') ?? '';
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getByText(code, { exact: false }).closest('tr')!;
const panel = () => document.querySelector<HTMLElement>('aside.sales-ld')!;
const fetched = (path: string) => apiMock.mock.calls.filter(([url]) => url === path).length;
const togglePanel = () => fireEvent.keyDown(window, { key: '.', ctrlKey: true });
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *, .nx-summary-filter'))
      .map((part) => part.textContent?.replace(/\s+/g, ' ').trim())
      .join(' '),
  );
const tagOf = (tr: HTMLElement) => tr.querySelector<HTMLElement>('.nx-status-tag');

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe('salesListTag', () => {
  it('maps each screen status to a StatusTag tone', () => {
    expect(salesListTag('invoice', 'Posted')).toEqual({ tone: 'ok', label: 'Kesildi' });
    expect(salesListTag('invoice', 'Voided')).toEqual({ tone: 'off', label: 'İptal' });
    expect(salesListTag('quote', 'Draft')).toEqual({ tone: 'info', label: 'Taslak' });
    expect(salesListTag('quote', 'Sent')).toEqual({ tone: 'warn', label: 'İletildi' });
    expect(salesListTag('quote', 'Rejected')).toEqual({ tone: 'bad', label: 'Reddedildi' });
    expect(salesListTag('quote', 'Expired')).toEqual({ tone: 'off', label: 'Süresi doldu' });
    expect(salesListTag('order', 'Open')).toEqual({ tone: 'warn', label: 'Açık' });
    expect(salesListTag('order', 'Fulfilled')).toEqual({ tone: 'ok', label: 'Tamamlandı' });
    expect(salesListTag('delivery', 'Posted')).toEqual({ tone: 'ok', label: 'Sevk edildi' });
    expect(salesListTag('request', 'Open')).toEqual({ tone: 'warn', label: 'Açık' });
    expect(salesListTag('request', 'Quoted')).toEqual({ tone: 'ok', label: 'Teklif verildi' });
    expect(salesListTag('return', 'Posted')).toEqual({ tone: 'ok', label: 'İşlendi' });
    expect(salesListTag('return', 'Voided')).toEqual({ tone: 'off', label: 'İptal' });
  });
});

describe('Satış Faturaları list', () => {
  it('shows the list type: cards from the page, checkbox column, tags, numbers, footer, no row menu', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(screen.getByRole('heading', { name: /Satış Faturaları/ })).toBeTruthy();
    // Kesilen: the two posted invoices of the page; İptal: one voided. No Kalan / Vade data in the list.
    expect(cards()).toEqual(['Kesilen 2.000,00 TRY 2 fatura · bu sayfa', 'İptal 1 bu sayfa']);
    expect(screen.queryByText(/Tahsil edilmemiş|Vadesi geçen/)).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(tagOf(row('F-i1'))?.className).toContain('is-ok');
    expect(tagOf(row('F-i2'))?.className).toContain('is-off');
    expect(document.querySelector('.sales-row-actions-trigger')).toBeNull();
    const total = within(row('F-i1')).getByText(/1\.200,00/).closest('td')!;
    expect(total.className).toContain('nx-num');
    expect(total.querySelector('b')).toBeNull();
    expect(within(row('F-i1')).getByText('F-i1').closest('td')!.className).toContain('nx-code');
    const footer = document.querySelector<HTMLElement>('.nx-list-footer')!;
    expect(footer.textContent).toContain('↑↓ gez · Boşluk işaretle · Enter aç');
    expect(footer.textContent).toContain('Gösterilen');
    expect(footer.textContent).toContain('3 / 3');
  });

  it('a row click makes it current (no document opens); the bar acts on it; nothing is current before', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(enabled('open')).toBe(false);
    expect(document.querySelector('tr[aria-current="true"]')).toBeNull();
    fireEvent.click(row('F-i1'));
    await waitFor(() => expect(row('F-i1').getAttribute('aria-current')).toBe('true'));
    expect(document.querySelector('.doc-surface')).toBeNull();
    expect(enabled('open')).toBe(true);
    expect(reason('delete')).toContain('Kesilmiş belge silinemez — İşlemler › İptal et');
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
  });

  it('the code link still opens the invoice in one click', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'F-i1 fatura ayrıntılarını aç' }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
  });

  it('the detail panel (Ctrl+.) shows the current invoice: Özet, belge zinciri, Satırlar, Tahsilat', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    togglePanel();
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panel().textContent).toContain('Özetini görmek için listeden bir fatura seçin.');
    expect(fetched('/api/sales/invoices/i1')).toBe(0);
    fireEvent.click(row('F-i1'));
    await waitFor(() => expect(within(panel()).getByText('Kalan')).toBeTruthy());
    const p = within(panel());
    expect(p.getByRole('heading', { name: 'Acme' })).toBeTruthy();
    expect(panel().querySelector('.nx-status-tag.is-ok')?.textContent).toBe('Kesildi');
    expect(p.getByText('Genel toplam').nextElementSibling?.textContent).toBe('1.200,00 TRY');
    expect(p.getByText('Kalan').nextElementSibling?.textContent).toBe('800,00 TRY');
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['S-o1 Satış siparişi', 'I-d1 Satış irsaliyesi', 'F-i1 Bu fatura']);
    // Özet previews the first lines; "tümü" opens the Satırlar tab.
    expect(within(p.getByRole('region', { name: 'Satırlar' })).getByText('Koli 40x30')).toBeTruthy();
    fireEvent.click(p.getByRole('button', { name: 'tümü' }));
    expect(p.getByRole('tab', { name: 'Satırlar' }).getAttribute('aria-selected')).toBe('true');
    expect(p.getByText(/Koli 40x30/)).toBeTruthy();
    expect(p.getByText(/Streç film/)).toBeTruthy();
    fireEvent.click(p.getByRole('tab', { name: 'Tahsilat' }));
    expect(p.getByText('TAH-1')).toBeTruthy();
    expect(p.getByText('Tahsil edilen').nextElementSibling?.textContent).toBe('400,00 TRY');
    // Aç in the panel opens the document; while it is open the panel loads nothing.
    await act(async () => {
      fireEvent.click(p.getByRole('button', { name: /Aç/ }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
  });

  it('loads only the row the user settles on, and a late answer for an earlier row is dropped', async () => {
    let releaseFirst: (value: unknown) => void = () => undefined;
    overrides.set('/api/sales/invoices/i1', () => new Promise((resolve) => { releaseFirst = resolve; }));
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    togglePanel();
    // Quick moves: only the last row is fetched.
    fireEvent.click(row('F-i2'));
    fireEvent.click(row('F-i3'));
    await settle();
    expect(fetched('/api/sales/invoices/i2')).toBe(0);
    expect(fetched('/api/sales/invoices/i3')).toBe(1);
    // i1 is slow; the user moves on to i3 before it answers.
    fireEvent.click(row('F-i1'));
    await settle();
    expect(fetched('/api/sales/invoices/i1')).toBe(1);
    fireEvent.click(row('F-i3'));
    await settle();
    await act(async () => {
      releaseFirst(invoiceDetail('i1', 'Posted', 1200));
    });
    await settle(50);
    expect(within(panel()).getByText('Kalan').nextElementSibling?.textContent).toBe('400,00 TRY');
    expect(panel().textContent).toContain('F-i3');
  });

  it('ticked rows get the bulk bar with only Excel (seçilenler); Aç and Sil need one record', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(within(row('F-i1')).getByRole('checkbox'));
    fireEvent.click(within(row('F-i2')).getByRole('checkbox'));
    const bulk = await screen.findByRole('toolbar', { name: 'Toplu işlemler' });
    expect(within(bulk).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Excel (seçilenler)', '✕ Esc']);
    expect(document.querySelector('.nx-list-footer')?.textContent).toContain('2 seçili');
    // Two ticked rows and no current row: no single record to open or delete.
    expect(enabled('open')).toBe(false);
    expect(enabled('delete')).toBe(false);
    expect(reason('delete')).toContain('Önce bir kayıt seçin');
  });

  it('an open document hides the list panel and the bulk bar; Ctrl+. does not bring them back', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    togglePanel();
    await waitFor(() => expect(panel()).not.toBeNull());
    fireEvent.click(within(row('F-i1')).getByRole('checkbox'));
    fireEvent.click(within(row('F-i2')).getByRole('checkbox'));
    expect(screen.getByRole('toolbar', { name: 'Toplu işlemler' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'F-i3 fatura ayrıntılarını aç' }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    expect(panel()).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Toplu işlemler' })).toBeNull();
    togglePanel();
    await settle();
    expect(panel()).toBeNull();
    // The open invoice is fetched by the document only, not by a hidden panel.
    expect(fetched('/api/sales/invoices/i3')).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    await waitFor(() => expect(screen.getByRole('toolbar', { name: 'Toplu işlemler' })).toBeTruthy());
  });

  it('Enter after ↑/↓ opens the new current row, not the row that had the focus', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    const first = row('F-i1');
    first.focus();
    fireEvent.click(first);
    await waitFor(() => expect(first.getAttribute('aria-current')).toBe('true'));
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    await waitFor(() => expect(row('F-i2').getAttribute('aria-current')).toBe('true'));
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? first, { key: 'Enter' });
    });
    await waitFor(() => expect(fetched('/api/sales/invoices/i2')).toBe(1));
    expect(fetched('/api/sales/invoices/i1')).toBe(0);
  });

  it('column widths fit the list beside the menu at 1440 (no horizontal scroll)', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    const widths = Array.from(grid().querySelectorAll<HTMLElement>('thead tr:last-child th')).map((th) => parseFloat(th.style.width) || 0);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(1100);
  });
});

describe('Satış Teklifleri list', () => {
  it('keeps the status chips, uses tags and moves the row actions to İşlemler for the current row', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(screen.getByRole('button', { name: 'İletildi' })).toBeTruthy();
    expect(document.querySelector('.sales-row-actions-trigger')).toBeNull();
    expect(tagOf(row('T-q1'))?.className).toContain('is-info');
    expect(tagOf(row('T-q2'))?.className).toContain('is-warn');
    expect(cards()).toEqual(['Teklif tutarı 300,00 TRY bu sayfa', 'Yanıt bekleyen 1 bu sayfa Filtrele']);
    fireEvent.click(row('T-q1'));
    await waitFor(() => expect(openMenu()).toEqual(['Düzenle', 'İletildi yap', 'Teklif alanları', 'CSV olarak dışa aktar']));
    fireEvent.click(row('T-q2'));
    await waitFor(() => expect(openMenu()).toEqual(['Kabul et', 'Reddet', 'Teklif alanları', 'CSV olarak dışa aktar']));
  });

  it('Yanıt bekleyen filters by the existing İletildi status', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Yanıt bekleyen/ }));
    await waitFor(() => expect(apiMock.mock.calls.some(([url]) => String(url).startsWith('/api/sales/quotes/?') && String(url).includes('status=Sent'))).toBe(true));
  });

  it('the panel shows the quote with its chain (talep → teklif → sipariş) and lines', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    togglePanel();
    fireEvent.click(row('T-q3'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['TLP-r1 Satış talebi', 'T-q3 Bu teklif', 'S-o1 Satış siparişi']);
    expect(within(panel()).getByText('Genel toplam').nextElementSibling?.textContent).toBe('100,00 TRY');
    fireEvent.click(within(panel()).getByRole('tab', { name: 'Satırlar' }));
    expect(within(panel()).getByText(/Koli 40x30/)).toBeTruthy();
  });
});

describe('Satış Siparişleri list', () => {
  it('cards, tags and the panel with the order chain; the row menu stays (Düzenle has no bar command)', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(cards()).toEqual(['Sipariş tutarı 500,00 TRY bu sayfa', 'Sevk bekleyen 1 bu sayfa']);
    expect(tagOf(row('S-o1'))?.className).toContain('is-warn');
    expect(tagOf(row('S-o2'))?.className).toContain('is-ok');
    expect(document.querySelectorAll('.sales-row-actions-trigger').length).toBe(2);
    togglePanel();
    fireEvent.click(row('S-o1'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['T-q3 Satış teklifi', 'S-o1 Bu sipariş']);
  });
});

describe('Satış İrsaliyeleri list', () => {
  it('no implicit first row, Faturalanmamış filters with the existing query, the panel shows the chain', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(document.querySelector('tr[aria-current="true"]')).toBeNull();
    expect(document.querySelector('.sales-row-actions-trigger')).toBeNull();
    expect(tagOf(row('I-d1'))?.className).toContain('is-ok');
    expect(tagOf(row('I-d2'))?.className).toContain('is-off');
    expect(cards()).toEqual(['Faturalanmamış 1 bu sayfa Filtrele', 'İptal 1 bu sayfa']);
    togglePanel();
    fireEvent.click(row('I-d3'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['S-o1 Satış siparişi', 'I-d3 Bu irsaliye', 'Satış faturası Kesildi']);
    fireEvent.click(screen.getByRole('button', { name: /Faturalanmamış/ }));
    await waitFor(() => expect(apiMock.mock.calls.some(([url]) => String(url).includes('unbilledOnly=true'))).toBe(true));
  });
});

describe('Satış Talepleri list', () => {
  it('a row click makes it current; Aç opens it; the panel lists the quotes made from it', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await settle();
    expect(cards()).toEqual(['Teklif bekleyen 1 bu sayfa']);
    expect(tagOf(row('TLP-r2'))?.className).toContain('is-warn');
    togglePanel();
    fireEvent.click(row('TLP-r1'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    expect(document.querySelector('.doc-surface')).toBeNull();
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['TLP-r1 Bu talep', 'T-q3 Satış teklifi Kabul edildi']);
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
  });
});

describe('İadeler list (shared by sales and purchasing)', () => {
  it('Satış İadeleri: current row, cards, panel with the invoice chain', async () => {
    renderScreen(<SalesReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(cards()).toEqual(['İade tutarı 120,00 TRY bu sayfa', 'İptal 1 bu sayfa']);
    expect(tagOf(row('IADE-r1'))?.className).toContain('is-ok');
    togglePanel();
    fireEvent.click(row('IADE-r1'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    expect(document.querySelector('.doc-surface')).toBeNull();
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['F-i1 Satış faturası', 'IADE-r1 Bu iade']);
  });

  it('Satınalma İadeleri renders on the same list type and opens a return with Aç', async () => {
    renderScreen(<PurchaseReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    expect(tagOf(row('AIADE-pr1'))?.className).toContain('is-ok');
    togglePanel();
    fireEvent.click(row('AIADE-pr1'));
    await waitFor(() => expect(panel().querySelector('.sales-ld-chain')).not.toBeNull());
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['AF-pi1 Alış faturası', 'AIADE-pr1 Bu iade']);
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    expect(reason('delete')).toContain('Kesilmiş belge silinemez — İşlemler › İadeyi iptal et');
  });
});

describe('English', () => {
  it('has an entry for every new list text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Kesilen', 'fatura · bu sayfa', 'Teklif tutarı', 'Yanıt bekleyen', 'Sipariş tutarı', 'Sevk bekleyen', 'Faturalanmamış',
      'Teklif bekleyen', 'İade tutarı', 'birden çok para birimi', 'Bu fatura', 'Bu teklif', 'Bu sipariş', 'Bu irsaliye', 'Bu talep',
      'Bu iade', 'Belge zinciri', 'Tahsilat', 'Tahsil edilen', 'Kalan', 'Matrah', 'Satış faturası özeti', 'Satış teklifi özeti',
      'Satış siparişi özeti', 'Satış irsaliyesi özeti', 'Satış talebi özeti', 'İade özeti',
      'Özetini görmek için listeden bir fatura seçin.', 'Özetini görmek için listeden bir teklif seçin.',
      'Özetini görmek için listeden bir sipariş seçin.', 'Özetini görmek için listeden bir irsaliye seçin.',
      'Özetini görmek için listeden bir talep seçin.', 'Özetini görmek için listeden bir iade seçin.',
      'Henüz tahsilat yok.', 'Yükleniyor…', 'Satır yok.', 'Alış faturası', 'Satış talebi', 'Satış iadesi', 'Teslim tarihi',
      'Satırlar', 'bu sayfa · birden çok para birimi', 'F-i1 fatura ayrıntılarını aç',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});
