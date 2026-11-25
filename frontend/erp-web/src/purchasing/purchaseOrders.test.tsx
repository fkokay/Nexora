import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import SupplierOrdersPage from '../SupplierOrdersPage';
import { PurchaseOrderFlow, purchaseOrderListTag } from './purchaseOrderList';
import { commandReason } from '../action-bar/commandReason';

/*
 * Satınalma Siparişleri on the list / document type (Faz 4 Task 3): client-side chips and the "Teslim alınan" column
 * keep their sources; cards are page figures; the order document keeps its receipts (Faturala, mal kabul iptali) and
 * moves Mal kabul ekle to İşlemler.
 */

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const order = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `SA-${id}`, supplierId: 'sup1', supplierName: 'Ege Ambalaj', orderDate: '2026-11-01', expectedReceiptDate: '2099-12-01',
  targetWarehouseId: 'w1', currencyCode: 'TRY', status, grandTotal: 1000, lineCount: 1, createdAt: '2026-11-01', ...extra,
});
const orders = [
  order('o1', 'Open', { expectedReceiptDate: '2026-01-05' }),
  order('o2', 'PartiallyReceived', { grandTotal: 500 }),
  order('o3', 'Received', { grandTotal: 250 }),
  order('o4', 'Cancelled', { grandTotal: 999 }),
];
const invoice = { id: 'pi1', code: 'AF-0042', purchaseReceiptId: 'rc2', receiptCode: 'MK-2', purchaseOrderId: 'o1', purchaseOrderCode: 'SA-o1', supplierId: 'sup1', supplierName: 'Ege Ambalaj', invoiceDate: '2026-11-05', dueDate: '2026-12-05', currencyCode: 'TRY', status: 'Posted', grandTotal: 600, paidAmount: 0, outstandingAmount: 600, lineCount: 1, createdAt: '2026-11-05' };
const receipt = (id: string, status: string, withInvoice = false) => ({
  id, code: `MK-${id.slice(2)}`, purchaseOrderId: 'o1', purchaseOrderCode: 'SA-o1', warehouseId: 'w1', warehouseName: 'Ana depo',
  receiptDate: '2026-11-04', status, lineCount: 1, createdAt: '2026-11-04', invoice: withInvoice ? invoice : null, customFields: [],
});
const detailOf = (id: string) => {
  const { lineCount: _lineCount, ...summary } = orders.find((item) => item.id === id)!;
  return {
    ...summary,
    subtotal: 850, discountTotal: 0, taxTotal: 150, notes: 'Hızlı teslim', customFields: [],
    lines: [{ lineNumber: 1, stockItemId: 's1', stockCode: 'AMB-2040', stockName: 'Koli 40×30×30', unitCode: 'ADET', quantity: 10, receivedQuantity: id === 'o1' ? 6 : 10, remainingQuantity: id === 'o1' ? 4 : 0, unitPrice: 85, discountPercent: 0, vatPercent: 20, lineSubtotal: 850, discountAmount: 0, taxAmount: 150, lineTotal: 1000 }],
    receipts: id === 'o1' ? [receipt('rc1', 'Posted'), receipt('rc2', 'Posted', true), receipt('rc3', 'Voided')] : [],
  };
};

const calls: Array<{ url: string; method: string; body?: string }> = [];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/purchasing/orders/') return page(orders);
  const match = /^\/api\/purchasing\/orders\/(o\d)$/.exec(path);
  if (match) return detailOf(match[1]);
  if (path === '/api/purchasing/receipts/rc1/invoice') return { ...invoice, id: 'pi2', code: 'AF-9' };
  if (path === '/api/purchasing/requests/') return page([]);
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/') return [];
  if (path.endsWith('/units')) return { conversions: [] };
  if (path.endsWith('/locations') || path.includes('/locations')) return [];
  return page([]);
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  apiMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined });
    return respond(url);
  });
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  calls.length = 0;
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
const reason = (id: string) => commandReason(command(id)) ?? command(id).getAttribute('aria-label') ?? '';
function openMenu() {
  // No İşlemler button when the page has no menu items.
  if (!command('more')) return [];
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => item.textContent?.trim());
  fireEvent.click(command('more'));
  return items;
}
function runMenu(label: string) {
  fireEvent.click(command('more'));
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')).find((node) => node.textContent?.trim() === label);
  expect(item, label).toBeTruthy();
  fireEvent.click(item!);
}
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getByText(code, { exact: false }).closest('tr')!;
const panel = () => document.querySelector<HTMLElement>('aside.sales-ld');
const togglePanel = () => fireEvent.keyDown(window, { key: '.', ctrlKey: true });
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *')).map((part) => part.textContent?.replace(/\s+/g, ' ').trim()).join(' '),
  );
const tagOf = (tr: HTMLElement) => tr.querySelector<HTMLElement>('.nx-status-tag');
const flowSteps = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.doc-surface .doc-flow-step')).map(
    (step) => `${step.querySelector('span')?.textContent}${step.getAttribute('aria-current') ? '*' : ''}`,
  );

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function openOrderList(role = 'TenantAdmin') {
  renderScreen(<SupplierOrdersPage token="t" role={role} onNavigate={vi.fn()} />);
  await waitFor(() => expect(within(grid()).getByText('SA-o1')).toBeTruthy());
  await settle(500);
}

async function openOrderDocument(code: string) {
  fireEvent.doubleClick(row(code).querySelectorAll('td')[2]);
  await waitFor(() => expect(document.querySelector('.doc-surface')).toBeTruthy());
  await settle();
  return document.querySelector<HTMLElement>('.doc-surface')!;
}

describe('purchase order tag and flow', () => {
  it('maps the statuses to the list tones of mockup 07; overdue wins', () => {
    expect(purchaseOrderListTag('PendingApproval')).toEqual({ tone: 'warn', label: 'Onay bekliyor' });
    expect(purchaseOrderListTag('Open')).toEqual({ tone: 'info', label: 'Açık' });
    expect(purchaseOrderListTag('PartiallyReceived')).toEqual({ tone: 'warn', label: 'Kısmen alındı' });
    expect(purchaseOrderListTag('Received')).toEqual({ tone: 'ok', label: 'Tam alındı' });
    expect(purchaseOrderListTag('Cancelled')).toEqual({ tone: 'off', label: 'İptal' });
    expect(purchaseOrderListTag('Rejected')).toEqual({ tone: 'off', label: 'Reddedildi' });
    expect(purchaseOrderListTag('Open', true)).toEqual({ tone: 'bad', label: 'Gecikmiş' });
  });

  it('draws Onay bekliyor → Açık → Kısmen alındı → Tam alındı; İptal / Reddedildi only as the end state', () => {
    const { rerender } = render(<PurchaseOrderFlow status="PartiallyReceived" />);
    const steps = () => Array.from(document.querySelectorAll('.doc-flow-step')).map((step) => `${step.querySelector('span')?.textContent}${step.getAttribute('aria-current') ? '*' : ''}`);
    expect(steps()).toEqual(['Onay bekliyor', 'Açık', 'Kısmen alındı*', 'Tam alındı']);
    rerender(<PurchaseOrderFlow status="Cancelled" />);
    expect(steps()).toEqual(['Onay bekliyor', 'Açık', 'Kısmen alındı', 'Tam alındı', 'İptal*']);
    rerender(<PurchaseOrderFlow status="Rejected" />);
    expect(steps()).toEqual(['Onay bekliyor', 'Açık', 'Kısmen alındı', 'Tam alındı', 'Reddedildi*']);
  });
});

describe('Satınalma Siparişleri list', () => {
  it('shows the list type: page cards, client-side chips, tags (Gecikmiş red), received column from the order details', async () => {
    await openOrderList();
    expect(screen.getByRole('heading', { name: /Satınalma siparişleri/ })).toBeTruthy();
    // Page figures; the cancelled order is not added, overdue = an open order past its expected date.
    expect(cards()).toEqual(['Sipariş tutarı 1.750,00 TRY bu sayfa · iptaller hariç', 'Mal bekleyen 2 bu sayfa', 'Gecikmiş 1 bu sayfa']);
    expect(tagOf(row('SA-o1'))?.className).toContain('is-bad');
    expect(tagOf(row('SA-o1'))?.textContent).toBe('Gecikmiş');
    expect(tagOf(row('SA-o2'))?.className).toContain('is-warn');
    expect(tagOf(row('SA-o3'))?.className).toContain('is-ok');
    expect(tagOf(row('SA-o4'))?.className).toContain('is-off');
    // "Teslim alınan": each visible order's detail (unchanged source).
    await waitFor(() => expect(within(row('SA-o1')).getByText(/6 \/ 10/)).toBeTruthy());
    for (const id of ['o1', 'o2', 'o3', 'o4']) expect(calls.some((call) => call.url === `/api/purchasing/orders/${id}`)).toBe(true);
    // Chips filter the client index of up to 1000 orders (pageSize=100 pages).
    expect(calls.some((call) => call.url.startsWith('/api/purchasing/orders/?page=1&pageSize=100'))).toBe(true);
    const amount = within(row('SA-o2')).getByText('500,00').closest('td')!;
    expect(amount.className).toContain('nx-num');
    expect(amount.querySelector('b')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toContain('Önce bir kayıt seçin');
  });

  it('the Gecikmiş chip and card filter the client index', async () => {
    await openOrderList();
    fireEvent.click(document.querySelectorAll<HTMLElement>('.nx-summary-item')[2]);
    await settle();
    expect(within(grid()).getByText('SA-o1')).toBeTruthy();
    expect(within(grid()).queryByText('SA-o2')).toBeNull();
  });

  it('a click makes the row current (panel from the order detail); İşlemler carries Mal kabul ekle with its condition', async () => {
    await openOrderList();
    fireEvent.click(row('SA-o1').querySelectorAll('td')[3]);
    expect(document.querySelector('.doc-surface')).toBeNull();
    if (!panel()) togglePanel();
    await settle();
    expect(panel()?.textContent).toContain('SA-o1');
    expect(panel()?.textContent).toContain('Ana depo');
    expect(panel()?.textContent).toContain('MK-1');
    expect(panel()?.textContent).toContain('AF-0042');
    expect(openMenu()).toEqual(['Mal kabul ekle', 'Talep oluştur', 'Alanlar', 'CSV olarak dışa aktar']);
    fireEvent.click(row('SA-o3').querySelectorAll('td')[3]);
    await settle();
    expect(openMenu()).toEqual(['Talep oluştur', 'Alanlar', 'CSV olarak dışa aktar']);
  });

  it('the order document: flow, tiles, totals, receipts; Mal kabul ekle in İşlemler opens the receipt form', async () => {
    await openOrderList();
    const surface = await openOrderDocument('SA-o1');
    expect(flowSteps()).toEqual(['Onay bekliyor', 'Açık*', 'Kısmen alındı', 'Tam alındı']);
    expect(surface.querySelector('.balance-banner')).toBeNull();
    expect(surface.querySelector('.dd-tiles')?.textContent).toContain('gün geçti');
    expect(surface.querySelector('.dd-totals')?.textContent).toContain('Genel toplam');
    expect(enabled('export')).toBe(false);
    expect(reason('export')).toContain('Belge açıkken kullanılamaz');
    expect(openMenu()).toEqual(['Mal kabul ekle']);
    runMenu('Mal kabul ekle');
    await settle();
    expect(surface.querySelector('.sales-rf-embedded')).toBeTruthy();
  });

  it('the Mal kabul sub-form saves with its own Kaydet; the bar Kaydet and Ctrl+S do not save it', async () => {
    await openOrderList();
    const surface = await openOrderDocument('SA-o1');
    runMenu('Mal kabul ekle');
    await settle();
    const form = surface.querySelector<HTMLElement>('.sales-rf-embedded')!;
    const own = within(form).getByRole('button', { name: 'Kaydet' });
    expect(within(form).getByRole('button', { name: 'Vazgeç' })).toBeTruthy();
    expect(own.querySelector('kbd')).toBeNull();
    // Without a quantity the own Kaydet is disabled with the reason.
    expect((own as HTMLButtonElement).disabled).toBe(true);
    expect(own.getAttribute('title')).toBe('Kaydetmek için en az bir kalemde miktar girin.');
    fireEvent.change(within(form).getByLabelText('AMB-2040 mal kabul miktarı'), { target: { value: '2' } });
    const posts = () => calls.filter((call) => call.method === 'POST' && call.url === '/api/purchasing/orders/o1/receipts');
    // The bar's Kaydet does not belong to the sub-form.
    if (command('save')) expect(enabled('save')).toBe(false);
    fireEvent.keyDown(within(form).getByLabelText('AMB-2040 mal kabul miktarı'), { key: 's', ctrlKey: true });
    await settle();
    expect(posts()).toHaveLength(0);
    expect(openMenu()).toEqual(['Mal kabul ekle']);
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it('taslak 20: the Mal kabul sub-form suggests the PO price; a Bedelsiz line is costed "fatura gelince" and posts only the flag', async () => {
    await openOrderList();
    const surface = await openOrderDocument('SA-o1');
    runMenu('Mal kabul ekle');
    await settle();
    const form = surface.querySelector<HTMLElement>('.sales-rf-embedded')!;
    expect(within(form).getByLabelText<HTMLInputElement>('AMB-2040 birim fiyat').value).toBe('85');
    expect(within(form).getByText('siparişte 85,00')).toBeTruthy();
    expect(within(form).getByText('85,00 / ADET')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('AMB-2040 mal kabul miktarı'), { target: { value: '2' } });
    expect(within(form).getByRole('group', { name: 'Mal kabul fiyat toplamları' }).textContent).toContain('170,00 TRY');
    fireEvent.click(within(form).getByLabelText('AMB-2040 bedelsiz'));
    expect(within(form).queryByLabelText('AMB-2040 birim fiyat')).toBeNull();
    expect(within(form).getByText('fatura gelince')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Kaydet' }));
    const post = () => calls.find((call) => call.method === 'POST' && call.url === '/api/purchasing/orders/o1/receipts');
    await waitFor(() => expect(post()).toBeTruthy());
    expect(JSON.parse(post()!.body!).lines).toEqual([
      { orderLineNumber: 1, quantity: 2, unitCode: 'ADET', tracking: [], storageLocationId: null, isFreeOfCharge: true },
    ]);
  });

  it('Faturala still posts to /receipts/{id}/invoice; a cancelled order is the İptal end state without Mal kabul ekle', async () => {
    await openOrderList();
    const surface = await openOrderDocument('SA-o1');
    const receipts = surface.querySelector<HTMLElement>('[aria-label="Mal kabuller"]') ?? surface;
    // Mal kabul iptali only for a posted receipt without an invoice.
    expect(within(receipts).getAllByRole('button', { name: 'İptal et' })).toHaveLength(1);
    fireEvent.click(within(receipts).getByRole('button', { name: 'Fatura oluştur' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mal kabulini faturala' });
    fireEvent.change(within(dialog).getByPlaceholderText('TDR-2026-0042'), { target: { value: 'TDR-1' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url === '/api/purchasing/receipts/rc1/invoice')).toBe(true));
  });

  it('a cancelled order shows İptal as the end state and no Mal kabul ekle', async () => {
    await openOrderList();
    await openOrderDocument('SA-o4');
    expect(flowSteps()).toEqual(['Onay bekliyor', 'Açık', 'Kısmen alındı', 'Tam alındı', 'İptal*']);
    expect(!command('more') || command('more').getAttribute('aria-disabled') === 'true' || openMenu().length === 0).toBe(true);
  });
});
