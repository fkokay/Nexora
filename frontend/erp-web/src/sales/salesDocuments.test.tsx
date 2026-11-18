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
import { vatByRate } from './salesDocumentDetail';

/*
 * Satış belge detayları (taslak 02): durum akışı, başlıkta iş akışı düğmesi yok (İşlemler'de), başlık alanları,
 * satır ızgarası, KDV oranına göre toplamlar, bağlam paneli (belge zinciri) ve alt bilgi.
 */

const warehouses = [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
/** A line whose amounts add up like the server's: tax = subtotal × rate, total = subtotal + tax. */
const line = (n: number, name: string, quantity: number, subtotal: number, vat: number) => ({
  id: `l${n}`, lineNumber: n, orderLineNumber: n, stockItemId: `s${n}`, stockCode: `STK-${n}`, stockName: name, unitCode: 'ADET',
  quantity, unitPrice: subtotal / quantity, discountPercent: 0, vatPercent: vat, lineSubtotal: subtotal, discountAmount: 0,
  taxAmount: (subtotal * vat) / 100, lineTotal: subtotal + (subtotal * vat) / 100,
  deliveredQuantity: 0, remainingQuantity: quantity, reservationId: null, reservationWarehouseId: null, reservationWarehouseName: null, reservedQuantity: 0,
});
const lines = () => [line(1, 'Koli 40x30', 5, 100, 20), line(2, 'Gıda etiketi', 2, 50, 10)];
const amounts = { subtotal: 150, discountTotal: 0, taxTotal: 25, grandTotal: 175 };

const quote = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `T-${id}`, customerId: 'c1', customerName: 'Acme', customerCode: '120.01', quoteDate: '2026-11-01', validUntil: '2099-12-01',
  currencyCode: 'TRY', status, grandTotal: 175, lineCount: 2, createdAt: '2026-11-01', hasSalesOrder: false, revisionNumber: 1, ...extra,
});
const quoteDetail = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  ...quote(id, status, extra), ...amounts, notes: 'Fiyatlar 30 gün geçerlidir.', deliveryTerms: null, lines: lines(), customFields: [],
});
const order = (id: string, status: string) => ({
  id, code: `S-${id}`, quoteId: 'q3', quoteCode: 'T-q3', customerId: 'c1', customerName: 'Acme', orderDate: '2026-11-01',
  requestedDeliveryDate: '2026-11-20', currencyCode: 'TRY', status, grandTotal: 175, lineCount: 2, createdAt: '2026-11-01',
});
const invoice = (id: string, status: string) => ({
  id, code: `F-${id}`, deliveryId: 'd3', deliveryCode: 'I-d3', orderId: 'o1', orderCode: 'S-o1', customerId: 'c1',
  customerName: 'Acme', invoiceDate: '2026-11-01', currencyCode: 'TRY', status, grandTotal: 175, lineCount: 2, createdAt: '2026-11-01',
});
const invoiceDetail = (id: string, status: string) => ({
  ...invoice(id, status), ...amounts, ledgerEntryId: 'le1', lines: lines(), paidAmount: 75, returnedAmount: 0, outstandingAmount: 100,
  notes: 'SS-0411 siparişine istinaden.',
  collections: [{ id: 'col1', code: 'TAH-1', customerId: 'c1', customerName: 'Acme', salesInvoiceId: id, invoiceCode: `F-${id}`, collectionDate: '2026-11-05', amount: 75, currencyCode: 'TRY', paymentMethod: 'Cash', reference: null, status: 'Posted', createdAt: '2026-11-05' }],
  returns: [{ id: 'r9', code: 'IADE-r9', salesInvoiceId: id, invoiceCode: `F-${id}`, warehouseId: 'w1', warehouseName: 'Ana depo', returnDate: '2026-11-06', status: 'Voided', grandTotal: 10, lineCount: 1, createdAt: '2026-11-06', lines: [] }],
  customFields: [], eDocumentScenario: null, eDocumentTypeCode: null, eDocumentRecipientAlias: null, eCommercePurchaseUrl: null,
  eCommercePaymentAgentName: null, eCommercePaymentType: null, eCommercePaymentMeans: null, deliveryCarrierName: null, deliverySentAt: null,
});
const delivery = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `I-${id}`, orderId: 'o1', orderCode: 'S-o1', warehouseId: 'w1', warehouseName: 'Ana depo', deliveryDate: '2026-11-01',
  status, lineCount: 2, createdAt: '2026-11-01', hasSalesInvoice: false, invoiceStatus: null, invoiceId: null, ...extra,
});
const deliveryLines = () => lines().map((item) => ({ ...item, currencyCode: 'TRY' }));
const request = (id: string, status: string) => ({
  id, code: `TLP-${id}`, customerId: 'c1', customerName: 'Acme', requestDate: '2026-11-01', neededByDate: '2026-11-15',
  description: 'Kepez deposu için', status, lineCount: 1, quoteCount: status === 'Quoted' ? 1 : 0, createdAt: '2026-11-01',
});
const salesReturn = (id: string, status: string) => ({
  id, code: `IADE-${id}`, salesInvoiceId: 'i1', invoiceCode: 'F-i1', customerName: 'Acme', warehouseName: 'Ana depo',
  returnDate: '2026-11-02', status, currencyCode: 'TRY', grandTotal: 175, lineCount: 2,
});
const purchaseReturn = {
  id: 'pr1', code: 'AIADE-pr1', purchaseInvoiceId: 'pi1', invoiceCode: 'AF-pi1', supplierName: 'Ege Ambalaj', warehouseName: 'Ana depo',
  returnDate: '2026-11-03', status: 'Posted', currencyCode: 'TRY', grandTotal: 175, lineCount: 2,
};
const deliveries = () => [
  delivery('d1', 'Posted'),
  delivery('d2', 'Voided'),
  delivery('d3', 'Posted', { hasSalesInvoice: true, invoiceStatus: 'Posted', invoiceId: 'i1' }),
];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/warehouses/') return warehouses;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/' || path === '/api/finance/accounts') return [];
  if (path === '/api/sales/quotes/exchange-rates') return { baseCurrencyCode: 'TRY', rates: [] };
  if (path === '/api/sales/quotes/')
    return page([quote('q1', 'Draft'), quote('q2', 'Rejected'), quote('q3', 'Accepted', { hasSalesOrder: true, salesOrderId: 'o1', salesOrderCode: 'S-o1' })]);
  if (path === '/api/sales/quotes/q1') return quoteDetail('q1', 'Draft');
  if (path === '/api/sales/quotes/q2') return quoteDetail('q2', 'Rejected');
  if (path === '/api/sales/quotes/q3')
    return quoteDetail('q3', 'Accepted', { hasSalesOrder: true, salesOrderId: 'o1', salesOrderCode: 'S-o1', salesRequestId: 'r1', salesRequestCode: 'TLP-r1' });
  if (path.startsWith('/api/sales/quotes/') && path.endsWith('/revisions')) return [];
  if (path === '/api/sales/orders/') return page([order('o1', 'Open')]);
  if (path === '/api/sales/orders/o1') return { ...order('o1', 'Open'), ...amounts, lines: lines(), customFields: [] };
  if (path === '/api/sales/invoices/') return page([invoice('i1', 'Posted'), invoice('i2', 'Voided')]);
  if (path === '/api/sales/invoices/i1') return invoiceDetail('i1', 'Posted');
  if (path === '/api/sales/invoices/i2') return invoiceDetail('i2', 'Voided');
  if (path === '/api/sales/deliveries/') return page(deliveries());
  if (path === '/api/sales/deliveries/d1') return { ...deliveries()[0], lines: deliveryLines() };
  if (path === '/api/sales/deliveries/d2') return { ...deliveries()[1], lines: deliveryLines() };
  if (path === '/api/sales/deliveries/d3') return { ...deliveries()[2], lines: deliveryLines() };
  if (path === '/api/sales/requests/') return page([request('r1', 'Quoted'), request('r2', 'Open')]);
  if (path === '/api/sales/requests/r1')
    return {
      ...request('r1', 'Quoted'), currencyCode: 'TRY', cancelReason: null,
      lines: [{ lineNumber: 1, stockItemId: 's1', stockCode: 'STK-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 5 }],
      quotes: [{ id: 'q3', code: 'T-q3', status: 'Accepted', grandTotal: 175, currencyCode: 'TRY', quoteDate: '2026-11-02' }],
    };
  if (path === '/api/sales/returns/') return page([salesReturn('r1', 'Posted')]);
  if (path === '/api/sales/returns/r1') return { ...salesReturn('r1', 'Posted'), ...amounts, lines: lines() };
  if (path === '/api/purchasing/returns/') return page([purchaseReturn]);
  if (path === '/api/purchasing/returns/pr1') return { ...purchaseReturn, ...amounts, lines: lines() };
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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  apiMock.mockImplementation(async (url: string) => respond(url));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
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
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
const row = (code: string) => screen.getByText(code, { exact: false }).closest('tr')!;
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}
/** Opens a list row the familiar way (double-click) and waits for its document surface. */
async function openRow(code: string) {
  await settle();
  await act(async () => {
    fireEvent.doubleClick(within(row(code)).getAllByRole('cell')[2]);
  });
  await waitFor(() => expect(document.querySelector('.doc-surface .doc-surface-title h1 b')?.textContent).toBe(code));
  await settle();
}
const surface = () => {
  const all = document.querySelectorAll<HTMLElement>('.doc-surface');
  return all[all.length - 1];
};
const flowSteps = () =>
  Array.from(surface().querySelectorAll<HTMLElement>('.doc-flow-step')).map((step) => ({
    label: step.querySelector('span')?.textContent,
    state: step.classList.contains('is-current') ? 'current' : step.classList.contains('is-done') ? 'done' : step.classList.contains('is-terminal') ? 'terminal' : 'todo',
  }));
const aside = () => surface().querySelector<HTMLElement>('.doc-surface-aside')!;
const chain = () =>
  Array.from(aside().querySelectorAll<HTMLElement>('.dd-chain > li')).map((item) => ({
    text: item.querySelector('.dd-chain-text > span')?.textContent?.replace(/\s+/g, ' ').trim(),
    current: item.getAttribute('aria-current') === 'true',
    opens: !!item.querySelector('button.dd-chain-open'),
    status: item.querySelector('.doc-status')?.textContent,
  }));
const totals = () =>
  Array.from(surface().querySelectorAll<HTMLElement>('.dd-totals > div')).map((item) => [
    item.querySelector('dt')?.textContent?.trim(),
    item.querySelector('dd')?.textContent?.trim(),
    item.className,
  ]);
const VAT_ROWS = [
  ['KDV %20 · matrah 100,00 TRY', '20,00 TRY', 'is-sub'],
  ['KDV %10 · matrah 50,00 TRY', '5,00 TRY', 'is-sub'],
];
/** Every Sales detail leaves its workflow buttons to İşlemler: no legacy header slot. */
const expectNoHeaderActions = () => expect(surface().querySelector('.doc-surface-actions')).toBeNull();
const footer = () => surface().querySelector<HTMLElement>('.doc-surface-foot')!;

describe('vatByRate', () => {
  it('groups the server line amounts by rate and gives up when they do not add up to the document totals', () => {
    const rows = [
      { vatPercent: 20, taxable: 100, vat: 20 },
      { vatPercent: 10, taxable: 50, vat: 5 },
      { vatPercent: 20, taxable: 10, vat: 2 },
    ];
    expect(vatByRate(rows, { taxable: 160, vat: 27 })).toEqual([
      { rate: 20, taxable: 110, vat: 22 },
      { rate: 10, taxable: 50, vat: 5 },
    ]);
    // Withholding / additional taxes or rounding the lines do not explain: no breakdown, the totals stay as they are.
    expect(vatByRate(rows, { taxable: 160, vat: 30 })).toBeNull();
    expect(vatByRate([], { taxable: 0, vat: 0 })).toBeNull();
    // Tolerance is one kuruş per rate group, not per line: three lines of one rate off by 0,02 do not match.
    const oneRate = [1, 2, 3].map(() => ({ vatPercent: 20, taxable: 10, vat: 2 }));
    expect(vatByRate(oneRate, { taxable: 30, vat: 6.01 })).toEqual([{ rate: 20, taxable: 30, vat: 6 }]);
    expect(vatByRate(oneRate, { taxable: 30, vat: 6.02 })).toBeNull();
  });
});

describe('Satış teklifi detayı', () => {
  it('shows the flow, no header buttons, the line grid with VAT by rate, the chain and the footer', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('T-q3');
    expect(flowSteps()).toEqual([
      { label: 'Taslak', state: 'done' },
      { label: 'İletildi', state: 'done' },
      { label: 'Kabul edildi', state: 'current' },
    ]);
    expectNoHeaderActions();
    expect(openMenu()).toEqual([]);
    expect(within(surface()).getByRole('table', { name: 'Teklif satırları' }).className).toBe('dd-lines');
    // The lines summary is separate text nodes, so the English lookup translates "2 satır" on its own.
    expect(Array.from(surface().querySelectorAll('.dd-lines-meta > span')).map((node) => node.textContent)).toEqual(['2 satır', 'TRY']);
    expect(totals()).toEqual([
      ['Ara toplam', '150,00 TRY', ''],
      ['Toplam iskonto', '0,00 TRY', ''],
      ['Toplam KDV', '25,00 TRY', ''],
      ...VAT_ROWS,
      ['Genel toplam', '175,00 TRY', 'is-grand'],
    ]);
    expect(chain()).toEqual([
      { text: 'TLP-r1 Satış talebi', current: false, opens: false, status: undefined },
      { text: 'T-q3 Bu teklif', current: true, opens: false, status: 'Kabul edildi' },
      { text: 'S-o1 Satış siparişi', current: false, opens: true, status: undefined },
    ]);
    expect(within(aside()).getByText('120.01')).toBeTruthy();
    expect(footer().textContent).toContain('2 satır');
    expect(footer().textContent).toContain('Genel toplam 175,00 TRY');
    expect(footer().textContent).toContain('Alt+İ işlemler');
    // The chain opens the order like the summary tile does.
    await act(async () => {
      fireEvent.click(within(aside()).getByRole('button', { name: /S-o1/, hidden: true }));
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/sales/orders/o1', 't'));
  });

  it('a draft keeps its actions in İşlemler only; a rejected quote ends in the grey terminal step', async () => {
    renderScreen(<SalesQuotesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('T-q1');
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Düzenle', 'İletildi yap']);
    expect(flowSteps()[0]).toEqual({ label: 'Taslak', state: 'current' });
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    await openRow('T-q2');
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Reddedilen teklifi kabul et']);
    expect(flowSteps()).toEqual([
      { label: 'Taslak', state: 'todo' },
      { label: 'İletildi', state: 'todo' },
      { label: 'Kabul edildi', state: 'todo' },
      { label: 'Reddedildi', state: 'terminal' },
    ]);
  });
});

describe('Satış siparişi detayı', () => {
  it('shows the flow, the header fields card, VAT by rate and the chain with its deliveries and invoice', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('S-o1');
    expect(flowSteps()).toEqual([
      { label: 'Açık', state: 'current' },
      { label: 'Tamamlandı', state: 'todo' },
    ]);
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Stok ayır', 'İrsaliye oluştur']);
    expect(surface().classList.contains('doc-detail')).toBe(true);
    const info = surface().querySelector('.dd-info')!;
    expect(info.textContent).toContain('Sipariş tarihi');
    expect(info.textContent).toContain('20.11.2026');
    expect(totals()).toEqual([
      ['Ara toplam', '150,00 TRY', ''],
      ['Toplam iskonto', '0,00 TRY', ''],
      ['Toplam KDV', '25,00 TRY', ''],
      ...VAT_ROWS,
      ['Genel toplam', '175,00 TRY', 'is-grand'],
    ]);
    // The tenant line layout (screen view) still drives the order line grid.
    expect(within(surface()).getAllByText('Kalan miktar').length).toBeGreaterThan(0);
    await waitFor(() => expect(chain().map((item) => item.text)).toEqual([
      'T-q3 Satış teklifi',
      'S-o1 Bu sipariş',
      'I-d1 Satış irsaliyesi',
      'I-d2 Satış irsaliyesi',
      'I-d3 Satış irsaliyesi',
      'Satış faturası',
    ]));
    expect(chain()[5]).toMatchObject({ opens: true, status: 'Kesildi' });
    expect(chain()[3]).toMatchObject({ status: 'İptal' });
    await act(async () => {
      fireEvent.click(within(aside()).getByRole('button', { name: /Satış faturası/, hidden: true }));
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/sales/invoices/i1', 't'));
  });
});

describe('Satış faturası detayı', () => {
  it('lines before the notes, VAT by rate, the cancel only in İşlemler, the chain and the payment state', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('F-i1');
    expect(flowSteps()).toEqual([{ label: 'Kesildi', state: 'current' }]);
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Faturayı iptal et']);
    // The old body button is gone; the reason stays on the İşlemler item.
    expect(within(surface()).queryByRole('button', { name: /Faturayı iptal et|Önce tahsilat ve iadeleri iptal edin/ })).toBeNull();
    const table = within(surface()).getByRole('table', { name: 'Fatura satırları' });
    expect(table.className).toBe('dd-lines');
    const note = within(surface()).getByText('SS-0411 siparişine istinaden.');
    expect(table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(totals()).toEqual([
      ['Ara toplam', '150,00 TRY', ''],
      ['Toplam iskonto', '0,00 TRY', ''],
      ['Toplam KDV', '25,00 TRY', ''],
      ...VAT_ROWS,
      ['Genel toplam', '175,00 TRY', 'is-grand'],
    ]);
    // The tenant "Fatura tarihi" field uses the same day format as the header meta.
    expect(surface().querySelector('.dd-info')!.textContent).toContain('01.11.2026');
    expect(surface().querySelector('.dd-info')!.textContent).not.toContain('2026-11-01');
    // Paid / outstanding stay in the body (the panel is closed on narrow screens).
    expect(surface().querySelector('.dd-tiles')!.textContent).toContain('Açık bakiye');
    expect(chain()).toEqual([
      { text: 'S-o1 Satış siparişi', current: false, opens: false, status: undefined },
      { text: 'I-d3 Satış irsaliyesi', current: false, opens: false, status: undefined },
      { text: 'F-i1 Bu fatura', current: true, opens: false, status: 'Kesildi' },
      { text: 'IADE-r9 Satış iadesi', current: false, opens: false, status: 'İptal' },
    ]);
    // The open document's mark is its type's initials (Satış faturası → SF), as in mockup 02.
    expect(aside().querySelector('.dd-chain > li.is-current .dd-chain-mark')!.textContent).toBe('SF');
    expect(aside().textContent).toContain('Tahsil edilen');
    expect(footer().textContent).toContain('2 satır');
    // The Tahsilat ve İadeler tab keeps the collections grid.
    fireEvent.click(within(surface()).getByRole('tab', { name: /Tahsilat ve İadeler/ }));
    expect(await within(surface()).findByText('TAH-1')).toBeTruthy();
  });

  it('a voided invoice ends in İptal', async () => {
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('F-i2');
    expect(flowSteps()).toEqual([
      { label: 'Kesildi', state: 'todo' },
      { label: 'İptal', state: 'terminal' },
    ]);
  });
});

describe('Satış irsaliyesi detayı', () => {
  it('an invoiced delivery: Faturalandı is current, the chain opens its invoice', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('I-d3');
    expect(flowSteps()).toEqual([
      { label: 'Sevk edildi', state: 'done' },
      { label: 'Faturalandı', state: 'current' },
    ]);
    expectNoHeaderActions();
    expect(within(surface()).getByRole('table', { name: 'İrsaliye satırları' }).className).toBe('dd-lines');
    // The delivery keeps its own totals wording and order (bases, then VAT per rate ascending, "− X" discount).
    expect(totals()).toEqual([
      ['Mal / hizmet toplamı', '150,00 TL', ''],
      ['Toplam iskonto', '− 0,00 TL', 'is-muted'],
      ['KDV %10 matrahı', '50,00 TL', ''],
      ['KDV %20 matrahı', '100,00 TL', ''],
      ['KDV %10', '5,00 TL', ''],
      ['KDV %20', '20,00 TL', ''],
      ['KDV toplamı', '25,00 TL', ''],
      ['Genel toplam · Ödenecek tutar', '175,00 TL', 'is-grand'],
    ]);
    expect(chain()).toEqual([
      { text: 'S-o1 Satış siparişi', current: false, opens: false, status: undefined },
      { text: 'I-d3 Bu irsaliye', current: true, opens: false, status: 'Sevk edildi' },
      { text: 'Satış faturası', current: false, opens: true, status: 'Kesildi' },
    ]);
    await act(async () => {
      fireEvent.click(within(aside()).getByRole('button', { name: /Satış faturası/, hidden: true }));
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/sales/invoices/i1', 't'));
  });

  it('a shipped delivery without an invoice is at Sevk edildi; a voided one ends in İptal', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('I-d1');
    expect(flowSteps().map((step) => step.state)).toEqual(['current', 'todo']);
    expect(openMenu()).toEqual(['Faturalaştır', 'İptal et']);
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    await openRow('I-d2');
    expect(flowSteps()).toEqual([
      { label: 'Sevk edildi', state: 'todo' },
      { label: 'Faturalandı', state: 'todo' },
      { label: 'İptal', state: 'terminal' },
    ]);
  });
});

describe('Satış talebi detayı', () => {
  it('shows the flow, no header buttons (Teklif hazırla is in İşlemler) and the quotes in the chain', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await openRow('TLP-r1');
    expect(flowSteps()).toEqual([
      { label: 'Açık', state: 'done' },
      { label: 'Teklif verildi', state: 'current' },
    ]);
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Teklif hazırla']);
    expect(surface().querySelector('.dd-info')!.textContent).toContain('İhtiyaç tarihi');
    expect(within(surface()).getByRole('table', { name: 'Talep satırları' }).className).toBe('dd-lines');
    expect(chain()).toEqual([
      { text: 'TLP-r1 Bu talep', current: true, opens: false, status: 'Teklif verildi' },
      { text: 'T-q3 Satış teklifi', current: false, opens: false, status: 'Kabul edildi' },
    ]);
    // The linked quotes stay in the body too.
    expect(within(surface()).getByRole('table', { name: 'Bu talepten hazırlanan teklifler' })).toBeTruthy();
  });
});

describe('İade detayı (satış ve alış)', () => {
  it('Satış iadesi: flow, no header buttons, VAT by rate and the invoice in the chain', async () => {
    renderScreen(<SalesReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('IADE-r1');
    expect(flowSteps()).toEqual([{ label: 'İşlendi', state: 'current' }]);
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Faturayı aç', 'İadeyi iptal et']);
    expect(within(surface()).getByRole('table', { name: 'İade satırları' }).className).toBe('dd-lines');
    expect(totals()).toEqual([
      ['Ara toplam', '150,00 TRY', ''],
      ['Toplam iskonto', '0,00 TRY', ''],
      ['Toplam KDV', '25,00 TRY', ''],
      ...VAT_ROWS,
      ['Genel toplam', '175,00 TRY', 'is-grand'],
    ]);
    expect(chain()).toEqual([
      { text: 'F-i1 Satış faturası', current: false, opens: true, status: undefined },
      { text: 'IADE-r1 Bu iade', current: true, opens: false, status: 'İşlendi' },
    ]);
    await act(async () => {
      fireEvent.click(within(aside()).getByRole('button', { name: /F-i1/, hidden: true }));
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/sales/invoices/i1', 't'));
  });

  it('Alış iadesi uses the same detail with the supplier and the purchase invoice', async () => {
    renderScreen(<PurchaseReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('AIADE-pr1');
    expectNoHeaderActions();
    expect(surface().querySelector('.doc-surface-party')!.textContent).toBe('Ege Ambalaj');
    expect(chain()[0]).toMatchObject({ text: 'AF-pi1 Alış faturası', opens: true });
  });
});

describe('English', () => {
  it('has an entry for every new detail text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Faturalandı', 'Bu teklif', 'Bu sipariş', 'Bu fatura', 'Bu irsaliye', 'Bu talep', 'Bu iade', 'Belge zinciri', 'Cari',
      'Ödeme durumu', 'Toplam KDV', 'Teklif satırları', 'Fatura satırları', 'İrsaliye satırları', 'Talep satırları', 'İade satırları',
      'Bu talepten hazırlanan teklifler', 'Alt+İ işlemler', '2 satır', 'KDV %20 · matrah 100,00 TRY', 'KDV %20 matrahı', 'Unvan', 'Sevk deposu', 'Fatura bekliyor',
      'Satış siparişi', 'Satış irsaliyesi', 'Satış faturası', 'Satış teklifi', 'Alış faturası',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});
