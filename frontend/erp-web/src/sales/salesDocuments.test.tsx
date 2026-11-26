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
import { pageParamsOf, setPageParams } from '../pageNavigation';

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
  // Same answers as `api` (and recorded there): Onayla posts through authenticatedFetch to read the rule warnings.
  authenticatedFetch: vi.fn(async (url: string, token?: string, init?: RequestInit) =>
    new Response(JSON.stringify(await apiMock(url, token, init)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
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
  // No İşlemler button when the page has no menu items.
  if (!command('more')) return [];
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
/** Every Sales detail leaves its workflow buttons to İşlemler: the header has only Geri, the PgUp / PgDn pair and Vazgeç. */
const expectNoHeaderActions = () =>
  expect(
    Array.from(surface().querySelectorAll<HTMLElement>('header.doc-surface-head button')).filter(
      (button) => !button.matches('.doc-surface-back, .doc-surface-cancel') && !button.closest('.doc-surface-rnav'),
    ),
  ).toEqual([]);
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
      { text: 'TLP-r1 Satış talebi', current: false, opens: true, status: undefined },
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
      { label: 'Taslak', state: 'done' },
      { label: 'Onay bekliyor', state: 'done' },
      { label: 'Onaylı', state: 'current' },
      { label: 'Sevk edildi', state: 'todo' },
      { label: 'Faturalandı', state: 'todo' },
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

  it('the İrsaliye sub-form saves with its own Kaydet next to Vazgeç, not with the bar Kaydet', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('S-o1');
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'İrsaliye oluştur' }));
    });
    const form = await waitFor(() => screen.getByRole('heading', { name: 'Satış irsaliyesi' }).closest<HTMLElement>('.record-form')!);
    const own = within(form).getByRole('button', { name: 'Kaydet' });
    expect(own.querySelector('kbd')).toBeNull();
    expect(within(form).getByRole('button', { name: 'Vazgeç' })).toBeTruthy();
    const save = bar().querySelector<HTMLElement>('[data-command="save"]');
    if (save) expect(save.getAttribute('aria-disabled')).toBe('true');
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

/** Request body of the `method` call to `path`. */
function sentBody(path: string, method = 'POST') {
  const call = apiMock.mock.calls.find(([url, , init]) => url === path && init?.method === method);
  return call ? JSON.parse(call[2].body as string) : undefined;
}
/** Answers `overrides` first, then the shared responses, for the rest of one test. */
function withResponses(overrides: Record<string, unknown>) {
  apiMock.mockImplementation(async (url: string) => {
    const path = url.split('?')[0];
    return path in overrides ? overrides[path] : respond(url);
  });
}
const restoreResponses = () => apiMock.mockImplementation(async (url: string) => respond(url));

describe('İrsaliye fiyatı ve bedelsiz satır (taslak 20)', () => {
  it('the İrsaliye sub-form suggests the order prices, marks a change, locks a Bedelsiz line and posts the prices', async () => {
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('S-o1');
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'İrsaliye oluştur' }));
    });
    const form = await waitFor(() => screen.getByRole('heading', { name: 'Satış irsaliyesi' }).closest<HTMLElement>('.record-form')!);
    expect(within(form).getByText('siparişte 20,00')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('STK-1 birim fiyat'), { target: { value: '18' } });
    expect(within(form).getByText('siparişte 20,00 · değiştirildi')).toBeTruthy();
    // Tümünü bedelsiz yap marks every line; Bedelsizi kaldır suggests the order prices again.
    fireEvent.click(within(form).getByRole('button', { name: 'Tümünü bedelsiz yap' }));
    expect(within(form).getByLabelText<HTMLInputElement>('STK-1 bedelsiz').checked).toBe(true);
    expect(within(form).getByLabelText<HTMLInputElement>('STK-2 bedelsiz').checked).toBe(true);
    fireEvent.click(within(form).getByRole('button', { name: 'Bedelsizi kaldır' }));
    expect(within(form).getByLabelText<HTMLInputElement>('STK-1 birim fiyat').value).toBe('20');
    fireEvent.change(within(form).getByLabelText('STK-1 birim fiyat'), { target: { value: '18' } });
    fireEvent.click(within(form).getByLabelText('STK-2 bedelsiz'));
    const free = within(form).getByLabelText<HTMLInputElement>('STK-2 birim fiyat');
    expect(free.disabled).toBe(true);
    expect(free.value).toBe('');
    const cards = within(form).getByRole('group', { name: 'İrsaliye fiyat toplamları' });
    expect(cards.textContent).toContain('90,00 TRY');
    expect(cards.textContent).toContain('108,00 TRY');
    expect(cards.querySelector(':scope > div:last-child b')?.textContent).toBe('1');
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    });
    await waitFor(() => expect(sentBody('/api/sales/orders/o1/deliveries')).toBeDefined());
    const body = sentBody('/api/sales/orders/o1/deliveries');
    expect(body.lines).toEqual([
      { orderLineNumber: 1, quantity: 5, unitCode: 'ADET', storageLocationId: null, isFreeOfCharge: false, unitPrice: 18, discountPercent: 0, vatPercent: 20 },
      { orderLineNumber: 2, quantity: 2, unitCode: 'ADET', storageLocationId: null, isFreeOfCharge: true },
    ]);
  });

  const partlyFree = delivery('d4', 'Posted', {
    currencyCode: 'TRY', pricedNetTotal: 100, pricedVatTotal: 20, pricedGrandTotal: 120, freeLineCount: 1, unpricedLineCount: 0, pricingState: 'PartlyFree',
  });
  const partlyFreeLines = () => [
    { ...deliveryLines()[0], isFreeOfCharge: false, orderUnitPrice: 20, lineNetAmount: 100, lineVatAmount: 20, lineTotal: 120 },
    { ...deliveryLines()[1], unitPrice: null, discountPercent: null, vatPercent: null, isFreeOfCharge: true, orderUnitPrice: 25, lineNetAmount: null, lineVatAmount: null, lineTotal: null },
  ];
  const partlyFreeResponses = {
    '/api/sales/deliveries/': page([...deliveries(), partlyFree]),
    '/api/sales/deliveries/d4': { ...partlyFree, lines: partlyFreeLines() },
  };

  it('the list shows Tutar with the Kısmen bedelsiz tag; the document marks the free line', async () => {
    withResponses(partlyFreeResponses);
    try {
      renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
      await settle();
      expect(row('I-d4').textContent).toContain('120,00 TRY');
      expect(within(row('I-d4')).getByText('Kısmen bedelsiz')).toBeTruthy();
      await openRow('I-d4');
      const table = within(surface()).getByRole('table', { name: 'İrsaliye satırları' });
      expect(within(table).getByText('Bedelsiz', { selector: '.dp-tag' })).toBeTruthy();
      expect(within(table).getByText('— fiyatsız')).toBeTruthy();
      expect(within(table).getByText('faturada')).toBeTruthy();
      expect(surface().textContent).toContain('Bedelsiz satır: 1 · tutarı faturada girilir.');
    } finally {
      restoreResponses();
    }
  });

  it('Faturalaştır on a partly free delivery opens the invoice form: delivery prices prefilled, the free line needs an amount, overrides are sent', async () => {
    withResponses(partlyFreeResponses);
    try {
      renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
      await openRow('I-d4');
      fireEvent.click(command('more'));
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Faturalaştır' }));
      });
      const form = await waitFor(() => screen.getByRole('heading', { name: 'Fatura bilgileri' }).closest<HTMLElement>('.record-form')!);
      expect(form.textContent).toContain('1 satırın tutarı eksik');
      expect(within(form).getByLabelText<HTMLInputElement>('STK-1 birim fiyat').value).toBe('20');
      expect(within(form).getByText('irsaliyeden')).toBeTruthy();
      const freePrice = within(form).getByLabelText<HTMLInputElement>('STK-2 birim fiyat');
      expect(freePrice.value).toBe('');
      expect(freePrice.placeholder).toBe('tutar girin');
      const save = within(form).getByRole<HTMLButtonElement>('button', { name: 'Kaydet' });
      expect(save.disabled).toBe(true);
      expect(sentBody('/api/sales/deliveries/d4/invoice')).toBeUndefined();
      // 0 is a valid amount for a free line; the priced line may be changed (the delivery is not).
      fireEvent.change(freePrice, { target: { value: '0' } });
      fireEvent.change(within(form).getByLabelText('STK-1 birim fiyat'), { target: { value: '22' } });
      await waitFor(() => expect(save.disabled).toBe(false));
      await act(async () => {
        fireEvent.click(save);
      });
      await waitFor(() => expect(sentBody('/api/sales/deliveries/d4/invoice')).toBeDefined());
      expect(sentBody('/api/sales/deliveries/d4/invoice')).toEqual({
        customFields: {},
        lines: [
          { orderLineNumber: 1, unitPrice: 22, discountPercent: 0, vatPercent: 20 },
          // The free line has no stock card VAT here: blank discount / VAT are left to the server (order line).
          { orderLineNumber: 2, unitPrice: 0 },
        ],
      });
    } finally {
      restoreResponses();
    }
  });

  it('a fully priced order-based delivery still invoices in one click without a lines override', async () => {
    renderScreen(<SalesDeliveriesScreenPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('I-d1');
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Faturalaştır' }));
    });
    const form = await waitFor(() => screen.getByRole('heading', { name: 'Fatura bilgileri' }).closest<HTMLElement>('.record-form')!);
    expect(form.textContent).not.toContain('tutarı eksik');
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    });
    await waitFor(() => expect(sentBody('/api/sales/deliveries/d1/invoice')).toEqual({ customFields: {} }));
  });
});

describe('Satış talebi detayı', () => {
  it('shows the flow, no header buttons (Teklif hazırla is in İşlemler) and the quotes in the chain', async () => {
    renderScreen(<SalesCustomerRequestsPage token="t" onNavigate={vi.fn()} />);
    await openRow('TLP-r1');
    expect(flowSteps()).toEqual([
      { label: 'Açık', state: 'done' },
      { label: 'Kısmen teklif verildi', state: 'done' },
      { label: 'Teklif verildi', state: 'current' },
    ]);
    expectNoHeaderActions();
    expect(openMenu()).toEqual(['Düzenle', 'Teklif hazırla']);
    expect(surface().querySelector('.dd-tiles')!.textContent).toContain('İhtiyaç tarihi');
    expect(within(surface()).getByRole('table', { name: 'Talep satırları' }).className).toBe('dd-lines');
    expect(chain()).toEqual([
      { text: 'TLP-r1 Bu talep', current: true, opens: false, status: 'Teklif verildi' },
      { text: 'T-q3 Satış teklifi', current: false, opens: true, status: 'Kabul edildi' },
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

describe('Belge sayfa parametresiyle açılır (Cari Hesap Hareketleri)', () => {
  it('sales-invoices invoiceId + tab=transactions opens the invoice on Tahsilat ve İadeler and drops both params', async () => {
    setPageParams('sales-invoices', { invoiceId: 'i1', tab: 'transactions' });
    renderScreen(<SalesInvoicesPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Tahsilat ve İadeler/ }).getAttribute('aria-selected')).toBe('true'));
    expect(pageParamsOf('sales-invoices')).toEqual({});
  });

  it('sales-returns returnId opens the return and drops the param', async () => {
    setPageParams('sales-returns', { returnId: 'r1' });
    renderScreen(<SalesReturnsPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    await waitFor(() => expect(within(surface()).getByRole('table', { name: 'İade satırları' })).toBeTruthy());
    expect(pageParamsOf('sales-returns')).toEqual({});
  });
});

describe('Satış siparişi durum zinciri (belge kuralları)', () => {
  const asOrder = (status: string, extra: Record<string, unknown> = {}) => ({
    '/api/sales/orders/': page([order('o1', status)]),
    '/api/sales/orders/o1': { ...order('o1', status), ...amounts, lines: lines(), customFields: [] },
    ...extra,
  });
  afterEach(restoreResponses);

  it('a draft order shows the five-step flow and offers Onayla, which posts approve and shows the stock warning', async () => {
    withResponses({ ...asOrder('Draft'), '/api/sales/orders/o1/approve': { id: 'o1', code: 'S-o1', status: 'Open', warnings: ['STK-1: kullanılabilir 2 ADET, istenen 5 ADET'] } });
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('S-o1');
    expect(flowSteps().map((step) => step.label)).toEqual(['Taslak', 'Onay bekliyor', 'Onaylı', 'Sevk edildi', 'Faturalandı']);
    expect(flowSteps()[0].state).toBe('current');
    expect(openMenu()).toEqual(['Onayla', 'İptal et']);
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Onayla' }));
    });
    await waitFor(() => expect(sentBody('/api/sales/orders/o1/approve')).toBeDefined());
    expect(await screen.findByText(/STK-1: kullanılabilir 2 ADET, istenen 5 ADET/)).toBeTruthy();
  });

  it('a held order names its deciders; a listed person gets Onayla and Reddet, which posts the workflow decision', async () => {
    withResponses({ ...asOrder('PendingApproval'), '/api/sales/orders/o1/document': { approval: { instanceId: 'w1', step: 'Onay: buyukTutar', approvers: ['Mehmet Demir'], canDecide: true } },
      '/api/workflows/instances/w1/decision': {} });
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('S-o1');
    expect(await screen.findByText(/Onay bekliyor · karar: Mehmet Demir/)).toBeTruthy();
    expect(openMenu()).toEqual(['Onayla', 'Reddet', 'İptal et']);
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Onayla' }));
    });
    await waitFor(() => expect(sentBody('/api/workflows/instances/w1/decision')).toEqual({ decision: 'Approved', comment: null }));
  });

  it('an approved order without deliveries offers Onayı geri al and İptal et; İptal asks for a reason', async () => {
    withResponses({ ...asOrder('Open'), '/api/sales/deliveries/': page([]), '/api/sales/orders/o1/cancel': { id: 'o1', code: 'S-o1', status: 'Cancelled', warnings: [] } });
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await openRow('S-o1');
    expect(flowSteps()[2]).toEqual({ label: 'Onaylı', state: 'current' });
    expect(openMenu()).toEqual(['Stok ayır', 'İrsaliye oluştur', 'Onayı geri al', 'İptal et']);
    fireEvent.click(command('more'));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'İptal et' }));
    });
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Müşteri vazgeçti' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Siparişi iptal et' }));
    });
    await waitFor(() => expect(sentBody('/api/sales/orders/o1/cancel')).toMatchObject({ reason: 'Müşteri vazgeçti' }));
  });

  it('the list offers Düzenle only on draft rows', async () => {
    withResponses({ '/api/sales/orders/': page([order('o1', 'Open'), { ...order('o2', 'Draft'), code: 'S-o2' }]) });
    renderScreen(<SalesOrdersPage token="t" role="TenantAdmin" onNavigate={vi.fn()} />);
    await settle();
    const menuOf = (code: string) => {
      const trigger = screen.getByRole('button', { name: `${code} işlemleri` });
      fireEvent.click(trigger);
      const items = Array.from(document.querySelectorAll<HTMLElement>('.sales-row-menu-item')).map((x) => x.textContent?.trim());
      fireEvent.click(trigger);
      return items;
    };
    expect(menuOf('S-o2')).toContain('Düzenle');
    expect(menuOf('S-o1')).not.toContain('Düzenle');
  });
});
