import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import SupplierOrdersPage from '../SupplierOrdersPage';
import PurchaseInvoiceEntryPage from '../PurchaseInvoiceEntryPage';
import StandaloneSupplierInvoiceDraftPage from '../StandaloneSupplierInvoiceDraftPage';

/*
 * Satınalma oluşturma ekranları: yeni satınalma siparişi, mal kabul faturası girişi, bağımsız fatura taslakları.
 * Kaydetme isteklerinin gövdesi ve Esc onayı temel sürümle aynı kalmalıdır.
 */

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
const supplier = { id: 's1', code: '320.01', name: 'Ege Ambalaj', type: 'Supplier', isActive: true, currencyCode: 'TRY' };
const stock = { id: 'st1', code: 'AMB-1', name: 'Koli 40x30', unitCode: 'ADET', isActive: true, purchaseListPrice: 35, purchaseVatPercent: 20, purchaseDiscountPercent: 0, priceCurrencyCode: 'TRY', trackingMode: 'None' };
const receipt = {
  id: 'r1', receiptCode: 'MK-0009', purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0007', supplierId: 's1', supplierName: 'Ege Ambalaj',
  receiptDate: '2026-11-10', warehouseId: 'w1', warehouseCode: 'D1', warehouseName: 'Ana depo', lineCount: 1, currencyCode: 'TRY', purchaseOrderTotal: 8400,
};
const order = {
  id: 'po1', currencyCode: 'TRY', lines: [{ lineNumber: 1, unitPrice: 35, discountPercent: 0, vatPercent: 20 }],
  receipts: [{ id: 'r1', status: 'Posted', invoice: null, lines: [{ orderLineNumber: 1, stockCode: 'AMB-1', stockName: 'Koli 40x30', unitCode: 'ADET', quantity: 200 }] }],
};
const draftRow = (id: string, status: string) => ({
  id, supplierId: 's1', supplierName: 'Ege Ambalaj', invoiceNumber: `BF-${id}`, invoiceDate: '2026-11-12', dueDate: null, currencyCode: 'TRY',
  grandTotal: 1200, lineCount: 1, status, createdAt: '2026-11-12T10:00:00Z',
});
const draftDetail = {
  ...draftRow('d1', 'Draft'), notes: null, subtotal: 1000, discountTotal: 0, taxTotal: 200, rowVersion: 'rv-1',
  lines: [{ lineNumber: 1, description: 'Nakliye', quantity: null, unitCode: null, unitPrice: null, subtotal: 1000, discountAmount: 0, taxAmount: 200, total: 1200, expenseAccountId: null, vatRate: 20, standalonePurchaseReceiptLineId: null }],
};

function respond(url: string, init?: { method?: string }): unknown {
  const path = url.split('?')[0];
  const method = init?.method ?? 'GET';
  if (method === 'POST' && path === '/api/purchasing/orders/') return { id: 'po9', code: 'SA-9' };
  if (method === 'POST' && path === '/api/purchasing/receipts/r1/invoice') return { id: 'pi9', code: 'AF-9', grandTotal: 8400, currencyCode: 'TRY' };
  if (method === 'POST' && path === '/api/purchasing/standalone-invoices/') return { id: 'd9', invoiceNumber: 'BF-9' };
  if (method === 'PUT') return { id: 'd1', invoiceNumber: 'BF-d1' };
  if (method === 'POST' && path.endsWith('/post')) return { draftId: 'd1', status: 'Posted', journalEntryId: 'j1', ledgerEntryId: 'l1' };
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/purchasing/orders/custom-fields') return [];
  if (path === '/api/customers/') return page(url.includes('type=Supplier') ? [supplier] : []);
  if (path === '/api/customers/s1') return { ...supplier, paymentTermDays: 30 };
  if (path === '/api/stock/items/') return page([stock]);
  if (path === '/api/stock/items/st1/units') return { conversions: [] };
  if (path === '/api/finance/general-ledger/rule-profiles') return [];
  if (path === '/api/finance/general-ledger/accounts') return [{ id: 'a1', code: '770.01', name: 'Genel giderler', isActive: true, statementSection: 'Expense' }];
  if (path === '/api/purchasing/invoices/entry/receipts') return page([receipt]);
  if (path === '/api/purchasing/orders/po1') return order;
  if (path === '/api/purchasing/standalone-invoices/') return page([draftRow('d1', 'Draft'), draftRow('d2', 'Posted')]);
  if (path === '/api/purchasing/standalone-invoices/suppliers') return { items: [supplier], totalCount: 1 };
  if (path === '/api/purchasing/standalone-invoices/receipts') return [];
  if (path === '/api/purchasing/standalone-invoices/d1') return draftDetail;
  return page([]);
}

type Call = { url: string; method: string; body?: unknown };
const calls: Call[] = [];
function record(url: string, init?: { method?: string; body?: unknown }) {
  calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
}

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: { method?: string; body?: unknown }) => {
    record(url, init);
    return new Response(JSON.stringify(respond(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }),
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'req-1' });
  apiMock.mockImplementation(async (url: string, _token: string, init?: { method?: string; body?: unknown }) => {
    record(url, init);
    return respond(url, init);
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

function renderScreen(view: ReactNode, activeKey = 'v') {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey={activeKey} openKeys={['v', 'other']}>{view}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const command = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const enabled = (id: string) => command(id).getAttribute('aria-disabled') !== 'true';
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const ctrlS = () => fireEvent.keyDown(window, { key: 's', ctrlKey: true });
const sent = (path: string, method = 'POST') => calls.find((call) => call.url === path && call.method === method)?.body;
/** Picks `option` in the SearchableRecordPicker whose trigger currently reads `trigger`. */
async function pick(trigger: string, option: RegExp, nth = 0) {
  fireEvent.click(screen.getAllByText(trigger, { selector: 'button > span' })[nth].closest('button')!);
  const dialog = await screen.findByRole('dialog', { name: /seçin/ });
  fireEvent.click(within(dialog).getByRole('option', { name: option }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /seçin/ })).toBeNull());
}
async function pickStock() {
  const input = screen.getByLabelText('Stok kodu veya adıyla ara');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Ko' } });
  fireEvent.click(await screen.findByRole('option', { name: /Koli 40x30/ }, { timeout: 2000 }));
}
const confirmText = 'Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?';
async function escapeAsksAndStays(input: HTMLElement) {
  fireEvent.input(input, { target: { value: 'X-1' } });
  fireEvent.change(input, { target: { value: 'X-1' } });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(await screen.findByText(confirmText)).toBeTruthy();
  fireEvent.click(document.querySelector<HTMLElement>('.workspace-confirm-actions button.secondary')!);
  await waitFor(() => expect(screen.queryByText(confirmText)).toBeNull());
}
const input = (label: RegExp, nth = 0) => screen.getAllByLabelText(label)[nth] as HTMLInputElement;
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

describe('Yeni satınalma siparişi', () => {
  const renderOrder = (onNavigate = vi.fn()) =>
    renderScreen(<SupplierOrdersPage token="t" role="TenantUser" onNavigate={onNavigate} createPurchaseOrderPage />);

  it('Ctrl+S posts the same order body', async () => {
    renderOrder();
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    type(screen.getByPlaceholderText('SA-2026-0001'), 'SA-9');
    await pick('Tedarikçi seçin', /Ege Ambalaj/);
    await pickStock();
    await waitFor(() => expect((screen.getByLabelText('Satır 1 birim fiyat') as HTMLInputElement).value).toBe('35'));
    type(screen.getByLabelText('Satır 1 miktar'), '4');
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/orders/')).toBeDefined());
    const body = sent('/api/purchasing/orders/') as { orderDate: string };
    expect(body).toEqual({
      code: 'SA-9', supplierId: 's1', orderDate: body.orderDate, expectedReceiptDate: null, targetWarehouseId: null, currencyCode: 'TRY',
      notes: null, customFields: {},
      lines: [{ stockItemId: 'st1', quantity: 4, unitPrice: 35, discountPercent: 0, vatPercent: 20, unitCode: 'ADET' }],
    });
  });

  it('keeps the missing-supplier check before the request', async () => {
    renderOrder();
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    type(screen.getByPlaceholderText('SA-2026-0001'), 'SA-9');
    // The supplier picker is required; submitting the form itself (no browser validation in jsdom) reaches the check.
    fireEvent.submit(document.querySelector('form.rf-form')!);
    expect(await screen.findByText('Tedarikçi seçin.')).toBeTruthy();
    expect(sent('/api/purchasing/orders/')).toBeUndefined();
  });

  it('Esc on a touched order asks before leaving', async () => {
    const onNavigate = vi.fn();
    renderOrder(onNavigate);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await escapeAsksAndStays(screen.getByPlaceholderText('SA-2026-0001'));
    expect(onNavigate).not.toHaveBeenCalledWith('sales-purchasing');
  });
});

describe('Mal kabul faturası girişi', () => {
  it('saves the selected receipt invoice with the same body', async () => {
    const onInvoiceCreated = vi.fn();
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" onInvoiceCreated={onInvoiceCreated} />);
    await openReceipt();
    type(await screen.findByLabelText(/Tedarikçi fatura no/), 'TF-123');
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/receipts/r1/invoice')).toBeDefined());
    const body = sent('/api/purchasing/receipts/r1/invoice') as { invoiceDate: string };
    expect(body).toEqual({
      code: 'TF-123', invoiceDate: body.invoiceDate, accountingProfileCode: null, providerInvoiceUuid: null, providerScenario: null,
      providerInvoiceTypeCode: null, providerSenderAlias: null,
    });
    await waitFor(() => expect(onInvoiceCreated).toHaveBeenCalledWith('pi9'));
  });
});

describe('Bağımsız fatura taslakları', () => {
  const renderDrafts = () => renderScreen(<StandaloneSupplierInvoiceDraftPage token="t" role="TenantUser" />);

  it('Ctrl+S posts the same new draft body', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await startNewDraft();
    await pick('Tedarikçi seçin', /Ege Ambalaj/);
    type(input(/Tedarikçi fatura no/), 'BF-77');
    type(input(/^Satır 1 açıklama$/), 'Nakliye');
    type(input(/^Satır 1 ara toplam$/), '1000');
    type(input(/^Satır 1 vergi tutarı$/), '200');
    type(input(/^Satır 1 satır toplamı$/), '1200');
    type(input(/^Ara toplam/), '1000');
    type(input(/Vergi toplamı/), '200');
    type(input(/Genel toplam/), '1200');
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/standalone-invoices/')).toBeDefined());
    const body = sent('/api/purchasing/standalone-invoices/') as { invoiceDate: string };
    expect(body).toEqual({
      supplierId: 's1', invoiceNumber: 'BF-77', invoiceDate: body.invoiceDate, dueDate: null, currencyCode: 'TRY', notes: null,
      subtotal: 1000, discountTotal: 0, taxTotal: 200, grandTotal: 1200, requestId: 'req-1',
      lines: [{ lineNumber: 1, description: 'Nakliye', quantity: null, unitCode: null, unitPrice: null, subtotal: 1000, discountAmount: 0, taxAmount: 200, total: 1200, expenseAccountId: null, vatRate: null, standalonePurchaseReceiptLineId: null }],
    });
  });

  it('Düzenle loads the draft and Ctrl+S puts it with the row version', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await editDraft('d1');
    await waitFor(() => expect(input(/Tedarikçi fatura no/).value).toBe('BF-d1'));
    await act(async () => ctrlS());
    await waitFor(() => expect(sent('/api/purchasing/standalone-invoices/d1', 'PUT')).toBeDefined());
    expect(sent('/api/purchasing/standalone-invoices/d1', 'PUT')).toEqual({
      supplierId: 's1', invoiceNumber: 'BF-d1', invoiceDate: '2026-11-12', dueDate: null, currencyCode: 'TRY', notes: null,
      subtotal: 1000, discountTotal: 0, taxTotal: 200, grandTotal: 1200, expectedRowVersion: 'rv-1',
      lines: [{ lineNumber: 1, description: 'Nakliye', quantity: null, unitCode: null, unitPrice: null, subtotal: 1000, discountAmount: 0, taxAmount: 200, total: 1200, expenseAccountId: null, vatRate: 20, standalonePurchaseReceiptLineId: null }],
    });
  });

  it('Muhasebeleştir asks, then posts the draft', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await postDraft('d1');
    expect(await screen.findByText('Tedarikçi faturası muhasebeleştirilsin mi?')).toBeTruthy();
    fireEvent.click(within(document.querySelector<HTMLElement>('.workspace-confirm-actions')!).getByRole('button', { name: /Muhasebeleştir/ }));
    await waitFor(() => expect(calls.some((call) => call.url === '/api/purchasing/standalone-invoices/d1/post' && call.method === 'POST')).toBe(true));
  });
});

/* ---- Belge oluşturma görünümü (taslak 02) ve liste tipi ---- */

const form = () => document.querySelector<HTMLElement>('.record-form')!;
const head = () => form().querySelector<HTMLElement>('header.doc-surface-head')!;
const flowSteps = () =>
  Array.from(head().querySelectorAll('.doc-flow-step')).map(
    (step) => `${step.querySelector('span')?.textContent}${step.getAttribute('aria-current') ? '*' : ''}`,
  );
const footKeys = () => Array.from(form().querySelectorAll('.rf-keys > span')).map((node) => node.textContent);
/** Visible text with the parts of an amount ("200,00" + "TL") separated as they are on screen. */
function words(node: Node): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) parts.push(text.textContent ?? '');
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
}
const totalsOf = (label: string) =>
  Array.from(screen.getByLabelText(label).querySelectorAll(':scope > div')).map((row) => [
    words(row.querySelector('dt')!),
    words(row.querySelector('dd')!),
  ]);
const headButtons = () => Array.from(head().querySelectorAll('button')).map((button) => button.textContent?.trim());
function expectKitChrome(type: string) {
  expect(form().classList.contains('doc-form')).toBe(true);
  expect(head().querySelector('.doc-surface-eyebrow')!.textContent).toContain(type);
  expect(headButtons()).toEqual(['Vazgeç']);
  expect(head().querySelector('.doc-surface-meta .rf-badge')!.textContent).toMatch(/YENİ KAYIT|DÜZENLEME/);
  expect(form().querySelector('.rf-group-body.doc-form-fields')).not.toBeNull();
  const grid = form().querySelector<HTMLTableElement>('.dd-box table.dd-lines')!;
  expect(grid).not.toBeNull();
  return grid;
}

describe('Yeni satınalma siparişi: belge oluşturma görünümü', () => {
  it('kit header without a current step (the save creates Onay bekliyor or Açık), lines grid, totals by KDV rate', async () => {
    renderScreen(<SupplierOrdersPage token="t" role="TenantUser" onNavigate={vi.fn()} createPurchaseOrderPage />);
    await waitFor(() => expect(enabled('save')).toBe(true));
    await settle();
    const grid = expectKitChrome('Satınalma siparişi');
    expect(grid.querySelector('tr.dd-new-line [data-line-add-shortcut]')).not.toBeNull();
    expect(flowSteps()).toEqual(['Onay bekliyor', 'Açık', 'Kısmi mal kabul', 'Tam alındı']);
    expect(head().querySelector('[aria-current]')).toBeNull();
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Esc kapat']);
    expect(openMenu()).toEqual([]);
    type(screen.getByPlaceholderText('SA-2026-0001'), 'SA-9');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Satınalma siparişi SA-9');
    await pick('Tedarikçi seçin', /Ege Ambalaj/);
    await waitFor(() => expect(head().querySelector('.doc-surface-party')?.textContent).toBe('Ege Ambalaj'));
    await pickStock();
    await waitFor(() => expect((screen.getByLabelText('Satır 1 birim fiyat') as HTMLInputElement).value).toBe('35'));
    type(screen.getByLabelText('Satır 1 miktar'), '10');
    type(screen.getByLabelText('Satır 1 iskonto yüzdesi'), '10');
    expect(screen.getByLabelText('Satır 1 miktar').closest('td')!.className).toContain('dd-num');
    expect(words(screen.getByLabelText('Satır 1 tutar'))).toBe('315,00 TL');
    expect(totalsOf('Sipariş toplamları')).toEqual([
      ['Mal / hizmet toplamı', '350,00 TL'],
      ['Toplam iskonto', '− 35,00 TL'],
      ['KDV %20 matrahı', '315,00 TL'],
      ['KDV %20', '63,00 TL'],
      ['KDV toplamı', '63,00 TL'],
      ['Genel toplam · Ödenecek tutar', '378,00 TL'],
    ]);
    // The order note sits left of the totals in the lines card's bottom band.
    expect(screen.getByLabelText('Sipariş toplamları').closest('.dd-lines-footer')!.querySelector('textarea')).not.toBeNull();
    // The only line cannot be removed; a second one can.
    expect((screen.getByLabelText('Satır 1 kaldır') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(grid.querySelector<HTMLElement>('tr.dd-new-line [data-line-add-shortcut]')!);
    expect((screen.getByLabelText('Satır 2 kaldır') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a hidden keep-alive tab does not save on Ctrl+S', async () => {
    renderScreen(<SupplierOrdersPage token="t" role="TenantUser" onNavigate={vi.fn()} createPurchaseOrderPage />, 'other');
    await settle();
    await act(async () => ctrlS());
    await settle();
    expect(sent('/api/purchasing/orders/')).toBeUndefined();
  });
});

describe('Mal kabul faturası girişi: liste ve belge oluşturma görünümü', () => {
  it('a click makes the receipt current without opening the form; Aç opens it', async () => {
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" />);
    await screen.findByText('MK-0009');
    expect(command('open').getAttribute('title')).toContain('Önce bir kayıt seçin');
    selectRow('MK-0009');
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(document.querySelector('.record-form')).toBeNull();
    fireEvent.click(command('open'));
    await screen.findByLabelText(/Tedarikçi fatura no/);
  });

  it('invoice form: kit header, İşlendi not current before save, read-only receipt lines and totals, chain', async () => {
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" />);
    await openReceipt();
    const grid = expectKitChrome('Alış faturası');
    // Receipt lines are not edited here: no new-line row, no line shortcut.
    expect(grid.querySelector('tr.dd-new-line')).toBeNull();
    expect(flowSteps()).toEqual(['İşlendi']);
    // No line shortcut; the context panel (belge zinciri) has its key.
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+. bağlam paneli', 'Esc kapat']);
    expect(head().querySelector('.doc-surface-party')?.textContent).toBe('Ege Ambalaj');
    await waitFor(() => expect(totalsOf('Fatura toplamları')).toEqual([
      ['Ara toplam', '7.000,00'],
      ['KDV', '1.400,00'],
      ['Genel toplam', '8.400,00 TRY'],
    ]));
    expect(Array.from(grid.querySelectorAll('tbody tr')[0].querySelectorAll('td')).map((td) => words(td))).toEqual(
      ['1', 'AMB-1 Koli 40x30', '200', 'ADET', '7.000,00', '1.400,00'],
    );
    // Vade from the supplier's payment term, as today.
    type(screen.getByLabelText(/Fatura tarihi/), '2026-11-10');
    expect(await screen.findByText('Vade 10.12.2026 · 30 gün')).toBeTruthy();
    const chain = Array.from(form().querySelectorAll('.dd-chain li')).map((li) => words(li));
    expect(chain[0]).toContain('SA-0007');
    expect(chain[1]).toContain('MK-0009');
    type(screen.getByLabelText(/Tedarikçi fatura no/), 'TF-1');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Alış faturası TF-1');
  });

  it('Esc on a touched invoice asks before leaving; confirming returns to the list', async () => {
    renderScreen(<PurchaseInvoiceEntryPage token="t" role="TenantUser" />);
    await openReceipt();
    await escapeAsksAndStays(screen.getByLabelText(/Tedarikçi fatura no/));
    expect(document.querySelector('.record-form')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(await screen.findByText(confirmText)).toBeTruthy();
    fireEvent.click(document.querySelector<HTMLElement>('.workspace-confirm-actions button:not(.secondary)')!);
    await waitFor(() => expect(document.querySelector('.record-form')).toBeNull());
    expect(await screen.findByText('MK-0009')).toBeTruthy();
  });
});

describe('Bağımsız fatura taslakları: liste tipi ve belge oluşturma görünümü', () => {
  const renderDrafts = () => renderScreen(<StandaloneSupplierInvoiceDraftPage token="t" role="TenantUser" />);

  it('status tags, footer without a pager, İşlemler follow the current row', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    const tag = (text: string) => screen.getByText(text).closest('tr')!.querySelector('.nx-status-tag, [class*="status"]')!;
    expect(tag('BF-d1').textContent).toBe('Taslak');
    expect(tag('BF-d2').textContent).toBe('Muhasebeleştirildi');
    expect(tag('BF-d1').className).toContain('warn');
    expect(tag('BF-d2').className).toContain('ok');
    expect(document.querySelector('.nx-list-footer')!.textContent).toContain('Gösterilen 2 / 2');
    expect(document.querySelector('.nx-list-footer .list-pagination, .nx-list-footer nav')).toBeNull();
    // No row action column: Düzenle / Muhasebeleştir are in İşlemler.
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(openMenu().slice(0, 2)).toEqual([
      { label: 'Düzenle', reason: 'Önce bir kayıt seçin' },
      { label: 'Muhasebeleştir', reason: 'Önce bir kayıt seçin' },
    ]);
    selectRow('BF-d2');
    await waitFor(() => expect(command('open').getAttribute('title')).toContain('Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir.'));
    expect(openMenu().slice(0, 2)).toEqual([
      { label: 'Düzenle', reason: 'Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir.' },
      { label: 'Muhasebeleştir', reason: 'Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir.' },
    ]);
    selectRow('BF-d1');
    await waitFor(() => expect(enabled('open')).toBe(true));
    expect(openMenu().slice(0, 2)).toEqual([
      { label: 'Düzenle', reason: null },
      { label: 'Muhasebeleştir', reason: null },
    ]);
  });

  it('F2 opens the draft form: kit header, Taslak current, lines grid; Esc on a touched draft asks', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await startNewDraft();
    const grid = expectKitChrome('Tedarikçi faturası');
    expect(grid.querySelector('tr.dd-new-line [data-line-add-shortcut]')).not.toBeNull();
    expect(flowSteps()).toEqual(['Taslak*', 'Muhasebeleştirildi']);
    expect(footKeys()).toEqual(['Tab sonraki alan', 'Ctrl+S kaydet', 'Ctrl+Shift+Enter satır ekle', 'Esc kapat']);
    expect(screen.queryByText('BF-d1')).toBeNull();
    fireEvent.click(grid.querySelector<HTMLElement>('tr.dd-new-line [data-line-add-shortcut]')!);
    expect(screen.getByLabelText('Satır 2 açıklama')).toBeTruthy();
    await escapeAsksAndStays(screen.getByLabelText(/Tedarikçi fatura no/));
    expect(document.querySelector('.record-form')).not.toBeNull();
  });

  it('a failed save keeps the form and its request id', async () => {
    renderDrafts();
    await screen.findByText('BF-d1');
    await startNewDraft();
    apiMock.mockClear();
    const { authenticatedFetch } = await import('../authApi');
    vi.mocked(authenticatedFetch).mockImplementationOnce(async (url: string, _token: string, init?: RequestInit) => {
      record(url, init as { method?: string; body?: unknown });
      return new Response(JSON.stringify({ error: 'Fatura numarası kullanılıyor.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    });
    fireEvent.submit(document.querySelector('form.rf-form')!);
    expect(await screen.findByText('Fatura numarası kullanılıyor.')).toBeTruthy();
    expect(document.querySelector('.record-form')).not.toBeNull();
    const posts = calls.filter((call) => call.url === '/api/purchasing/standalone-invoices/' && call.method === 'POST');
    expect((posts[0].body as { requestId: string }).requestId).toBe('req-1');
  });
});

describe('English text of the purchasing create screens', () => {
  it('has an English entry for every new text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    const { loadEnglishDictionaries, localizedUiText } = await import('../locale');
    await loadEnglishDictionaries();
    const texts = [
      'Satınalma siparişi', 'Alış faturası', 'Tedarikçi faturası', 'Belge bilgileri', '* zorunlu alan', 'Sipariş satırları',
      'Sipariş toplamları', 'Fatura satırları', 'Fatura toplamları', 'Belge toplamları', 'Belge zinciri', 'Bu fatura', 'Mal kabul',
      'Satınalma siparişi', 'Depo', 'Kabul tarihi', 'Satır 1 tutar', 'Satır 1 kaldır', 'Satır 1 açıklama', 'Satır 1 vergi tutarı',
      'Satır 1 KDV oranı', 'Satır 1 gider hesabı', 'Satır 1 satır toplamı', 'Satır 1 ara toplam', 'Satır 1 iskonto tutarı', 'Satır 1 sil',
      'Siparişsiz mal kabul satırı', 'Açıklama *', 'Ara toplam *', 'İskonto *', 'Vergi tutarı *', 'Satır toplamı *', 'Gider hesabı',
      'İsk. %', 'Tutar', 'Stok', 'Taslak', 'Muhasebeleştirildi', 'Düzenle', 'Muhasebeleştir', 'Kaydedilme', 'Vade tarihi', 'Fatura tarihi',
      'Faturalanabilir mal kabuller', 'Seçili mal kabul ayrıntıları', 'Bağımsız tedarikçi faturası özeti', 'Bağımsız tedarikçi faturaları',
      'Özetini görmek için listeden bir fatura seçin.', 'Fatura girmek için listeden bir mal kabul seçin.',
      'Yalnızca muhasebeleştirilmemiş taslaklar düzenlenebilir.', 'Satırlar yükleniyor…', 'Mal kabul satırları alınamadı.',
      'Miktar ve birim fiyat isteğe bağlıdır; satır tutarları kaynak belgeden girilir, yeniden hesaplanmaz.',
      'KDV oranı belge üzerinden kaydedilir; yeniden hesaplanmaz. Gider hesabı yalnız sonraki muhasebeleştirme için sınıflandırmadır.',
      'Bu satır mal kabul maliyetini faturadaki net tutara günceller. Yalnız kalan, tüketilmemiş stok için aktarılır; stok miktarı değişmez.',
      'Siparişsiz tedarikçi faturasını kaydedin; uygunsa mal kabul satırıyla eşleştirip maliyet farkını aktarın.',
      'Toplamları tedarikçi belgesinden aynen aktarın.', 'Deftere aktarıldı', 'Yalnızca siparişe bağlı, işlenmiş mal kabuller listelenir.',
    ];
    expect(texts.filter((text) => localizedUiText(text) === text)).toEqual([]);
  });
});

/* ---- Interaction helpers: the lists are the Satış list type (click selects, İşlemler, F2 / Aç). ---- */

/** The row's first data cell (not the checkbox cell). */
function rowCell(text: string) {
  return screen.getByText(text).closest('tr')!.querySelectorAll('td')[1] as HTMLElement;
}
function selectRow(text: string) {
  fireEvent.click(rowCell(text));
}
function openMenu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) => ({
    label: item.querySelector('span')?.textContent ?? '',
    reason: item.getAttribute('aria-disabled') === 'true' ? item.getAttribute('title') : null,
  }));
  fireEvent.click(command('more'));
  return items;
}
function runMenu(label: string) {
  fireEvent.click(command('more'));
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((node) => node.querySelector('span')?.textContent === label)!;
  fireEvent.click(item);
}
async function openReceipt() {
  await screen.findByText('MK-0009');
  fireEvent.doubleClick(rowCell('MK-0009'));
  await screen.findByLabelText(/Tedarikçi fatura no/);
}
async function startNewDraft() {
  await waitFor(() => expect(enabled('new')).toBe(true));
  fireEvent.keyDown(window, { key: 'F2' });
  await screen.findByLabelText(/Tedarikçi fatura no/);
}
async function editDraft(id: string) {
  selectRow(`BF-${id}`);
  await waitFor(() => expect(enabled('open')).toBe(true));
  runMenu('Düzenle');
}
async function postDraft(id: string) {
  selectRow(`BF-${id}`);
  await waitFor(() => expect(enabled('open')).toBe(true));
  runMenu('Muhasebeleştir');
}
