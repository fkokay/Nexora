import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import PurchaseInvoicesPage from '../PurchaseInvoicesPage';
import { purchaseInvoiceListTag, purchaseInvoiceOverdueDays } from './purchaseInvoiceStatus';
import { commandReason } from '../action-bar/commandReason';

const PAST = '2020-01-10';
const FUTURE = '2099-12-31';
const summary = (id: string, extra: Record<string, unknown>) => ({
  id, code: `AF-${id}`, purchaseReceiptId: `r-${id}`, receiptCode: `MK-${id}`, purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0007',
  supplierId: 's1', supplierName: 'Ege Ambalaj Ltd.', invoiceDate: '2026-11-01', dueDate: FUTURE, currencyCode: 'TRY', status: 'Posted',
  grandTotal: 1200, paidAmount: 0, outstandingAmount: 1200, lineCount: 2, createdAt: '2026-11-01', ...extra,
});
// pi5 is voided: the list still returns its total as the outstanding amount (real API shape).
const rows = [
  summary('pi1', { dueDate: PAST }),
  summary('pi2', { paidAmount: 400, outstandingAmount: 800, supplierName: 'Marmara Kimya' }),
  summary('pi3', { grandTotal: 300, paidAmount: 300, outstandingAmount: 0 }),
  summary('pi4', { grandTotal: 500, outstandingAmount: 500 }),
  summary('pi5', { status: 'Voided', grandTotal: 700, outstandingAmount: 700, dueDate: PAST }),
];
const line = (n: number, name: string) => ({
  id: `l${n}`, purchaseReceiptLineId: `rl${n}`, orderLineNumber: n, stockItemId: `s${n}`, stockCode: `STK-${n}`, stockName: name,
  unitCode: 'ADET', quantity: 10, unitPrice: 50, discountPercent: 0, vatPercent: 20, lineSubtotal: 500, discountAmount: 0, taxAmount: 100, lineTotal: 600,
});
const detail = (id: string) => ({
  ...rows.find((row) => row.id === id)!, subtotal: 1000, discountTotal: 0, taxTotal: 200, providerInvoiceUuid: null, providerScenario: null,
  providerInvoiceTypeCode: null, providerSenderAlias: null, accountingProfileCode: null,
  lines: [line(1, 'Koli 40x30'), line(2, 'Streç film')],
  payments: id === 'pi2'
    ? [{ id: 'pay1', code: 'TO-1', purchaseInvoiceId: 'pi2', invoiceCode: 'AF-pi2', paymentDate: '2026-11-05', amount: 400, currencyCode: 'TRY', paymentMethod: 'Cash', reference: null, status: 'Posted', createdAt: '2026-11-05' }]
    : [],
  returns: [],
});

const overrides = new Map<string, () => unknown>();
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });
function respond(url: string): unknown {
  const path = url.split('?')[0];
  const override = overrides.get(path);
  if (override) return override();
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path === '/api/purchasing/invoices/') return page(rows);
  const match = /^\/api\/purchasing\/invoices\/(pi\d)$/.exec(path);
  if (match) return detail(match[1]);
  if (path.startsWith('/api/screen-views/')) return { id: null, fields: [{ key: 'code', label: 'Fatura no', visible: true, position: 0 }] };
  if (path === '/api/finance/accounts') return [];
  if (path.startsWith('/api/stock/items/')) return { conversions: [] };
  if (path.endsWith('/custom-fields') || path === '/api/hr/employees/') return [];
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
const reason = (id: string) => commandReason(command(id)) ?? command(id).getAttribute('aria-label') ?? '';
/** İşlemler items as "label" or "label (disabled: reason)". */
function menu() {
  fireEvent.click(command('more'));
  const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map((item) =>
    item.getAttribute('aria-disabled') === 'true' ? `${item.textContent?.trim()} (${item.title})` : item.textContent?.trim(),
  );
  fireEvent.click(command('more'));
  return items;
}
async function runMenu(label: string) {
  fireEvent.click(command('more'));
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((node) => node.textContent?.trim() === label)!;
  await act(async () => {
    fireEvent.click(item);
  });
}
const grid = () => document.querySelector<HTMLElement>('.list-v2-list table')!;
const row = (code: string) => within(grid()).getByText(code, { exact: false }).closest('tr')!;
const panel = () => document.querySelector<HTMLElement>('aside.sales-ld')!;
const fetched = (path: string) => apiMock.mock.calls.filter(([url]) => url === path).length;
const cards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.nx-summary-item')).map((card) =>
    Array.from(card.querySelectorAll('.nx-summary-text > *')).map((part) => part.textContent?.replace(/\s+/g, ' ').trim()).join(' '),
  );
const tagOf = (tr: HTMLElement) => tr.querySelector<HTMLElement>('.nx-status-tag');
const cellOf = (tr: HTMLElement, header: string) => {
  const headers = Array.from(grid().querySelectorAll('thead tr:last-child th')).map((th) => th.textContent?.trim());
  return tr.querySelectorAll('td')[headers.indexOf(header)] as HTMLElement;
};
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const screenFor = (onNavigate = vi.fn()) => renderScreen(<PurchaseInvoicesPage token="t" role="TenantUser" onNavigate={onNavigate} />);

describe('purchaseInvoiceListTag', () => {
  const today = '2026-11-17';
  const posted = { status: 'Posted', dueDate: '2026-12-01', paidAmount: 0, outstandingAmount: 100 };
  it('derives the payment state from the amounts and the due date', () => {
    expect(purchaseInvoiceListTag({ ...posted, status: 'Voided' }, today)).toMatchObject({ tone: 'off', label: 'İptal' });
    expect(purchaseInvoiceListTag({ ...posted, outstandingAmount: 0, paidAmount: 100 }, today)).toMatchObject({ tone: 'ok', label: 'Ödendi' });
    // Nothing outstanding and nothing paid (fully returned): not Ödendi.
    expect(purchaseInvoiceListTag({ ...posted, outstandingAmount: 0, paidAmount: 0 }, today)).toMatchObject({ tone: 'info', label: 'İşlendi' });
    expect(purchaseInvoiceListTag({ ...posted, dueDate: '2026-11-13' }, today)).toMatchObject({ tone: 'bad', label: 'Vadesi geçti' });
    // Overdue wins over a partial payment.
    expect(purchaseInvoiceListTag({ ...posted, dueDate: '2026-11-13', paidAmount: 40 }, today)).toMatchObject({ tone: 'bad' });
    expect(purchaseInvoiceListTag({ ...posted, paidAmount: 40 }, today)).toMatchObject({ tone: 'warn', label: 'Kısmen ödendi' });
    expect(purchaseInvoiceListTag(posted, today)).toMatchObject({ tone: 'info', label: 'İşlendi' });
    // Due today is not overdue yet.
    expect(purchaseInvoiceListTag({ ...posted, dueDate: today }, today)).toMatchObject({ tone: 'info' });
  });
  it('counts overdue days only for an unpaid posted invoice', () => {
    expect(purchaseInvoiceOverdueDays({ ...posted, dueDate: '2026-11-13' }, today)).toBe(4);
    expect(purchaseInvoiceOverdueDays({ ...posted, dueDate: '2026-10-31' }, today)).toBe(17);
    expect(purchaseInvoiceOverdueDays({ ...posted, dueDate: '2026-11-13', status: 'Voided' }, today)).toBe(0);
    expect(purchaseInvoiceOverdueDays({ ...posted, dueDate: '2026-11-13', outstandingAmount: 0 }, today)).toBe(0);
    expect(purchaseInvoiceOverdueDays(posted, today)).toBe(0);
  });
});

describe('Satınalma Faturaları list', () => {
  it('shows the list type: page cards, default columns, tags, overdue due date, no add menu or row menu', async () => {
    screenFor();
    await settle();
    expect(screen.getByRole('heading', { name: /Satınalma Faturaları/ })).toBeTruthy();
    // Voided pi5 is in none of the amount cards although the list returns its total as outstanding.
    expect(cards()).toEqual([
      'Fatura toplamı 3.200,00 TRY bu sayfa · 4 fatura',
      'Ödenmemiş 2.500,00 TRY bu sayfa · 3 fatura',
      'Vadesi geçen 1 1.200,00 TRY · bu sayfa',
      'İptal 1 bu sayfa',
    ]);
    // No status chip (the endpoint has no status filter); no "Fatura ekle" menu in the heading.
    expect(screen.queryByText('Fatura ekle')).toBeNull();
    expect(document.querySelector('.purchase-invoice-add-menu')).toBeNull();
    // The server's default view (id null) does not replace the taslak 07 columns.
    expect(Array.from(grid().querySelectorAll('thead tr:last-child th')).map((th) => th.textContent?.trim()).filter(Boolean)).toEqual([
      'Fatura no', 'Tarih', 'Tedarikçi', 'Mal kabul', 'Vade', 'Genel toplam', 'Ödenen', 'Kalan', 'Durum',
    ]);
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(document.querySelector('.sales-row-actions-trigger')).toBeNull();
    const tags = ['pi1', 'pi2', 'pi3', 'pi4', 'pi5'].map((id) => `${tagOf(row(`AF-${id}`))?.textContent}:${tagOf(row(`AF-${id}`))?.className.match(/is-(\w+)/)?.[1]}`);
    expect(tags).toEqual(['Vadesi geçti:bad', 'Kısmen ödendi:warn', 'Ödendi:ok', 'İşlendi:info', 'İptal:off']);
    const due = cellOf(row('AF-pi1'), 'Vade');
    expect(due.textContent).toMatch(/^10\.01 · \d+ gün geçti$/);
    expect(due.querySelector('.purchase-inv-overdue')).not.toBeNull();
    // Kalan: red when overdue, amber when partly paid; a voided invoice owes nothing (no amount).
    expect(cellOf(row('AF-pi1'), 'Kalan').querySelector('.is-bad')?.textContent).toBe('1.200,00');
    expect(cellOf(row('AF-pi2'), 'Kalan').querySelector('.is-warn')?.textContent).toBe('800,00');
    expect(cellOf(row('AF-pi5'), 'Kalan').textContent).toBe('—');
    expect(cellOf(row('AF-pi5'), 'Vade').textContent).toBe('10.01.2020');
    const total = cellOf(row('AF-pi1'), 'Genel toplam');
    expect(total.className).toContain('nx-num');
    expect(total.querySelector('b')).toBeNull();
    expect(cellOf(row('AF-pi1'), 'Mal kabul').className).toContain('nx-code');
    const footer = document.querySelector<HTMLElement>('.nx-list-footer')!;
    expect(footer.textContent).toContain('↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç');
    expect(footer.textContent).toContain('5 / 5');
  });

  it('does not add amounts in several currencies', async () => {
    overrides.set('/api/purchasing/invoices/', () => page([rows[0], { ...rows[1], currencyCode: 'USD' }]));
    screenFor();
    await settle();
    expect(cards()).toEqual([
      'Fatura toplamı — bu sayfa · 2 fatura · birden çok para birimi',
      'Ödenmemiş — bu sayfa · 2 fatura · birden çok para birimi',
      'Vadesi geçen 1 1.200,00 TRY · bu sayfa',
      'İptal 0 bu sayfa',
    ]);
  });

  it('a card with no rows shows 0, and each card checks only its own rows for currencies', async () => {
    // pi3 (paid, TRY) and a USD voided invoice: nothing unpaid or overdue; the TRY total is added.
    overrides.set('/api/purchasing/invoices/', () => page([rows[2], { ...rows[4], currencyCode: 'USD' }]));
    screenFor();
    await settle();
    expect(cards()).toEqual([
      'Fatura toplamı 300,00 TRY bu sayfa · 1 fatura',
      'Ödenmemiş 0,00 bu sayfa · 0 fatura',
      'Vadesi geçen 0 bu sayfa',
      'İptal 1 bu sayfa',
    ]);
  });

  it('the panel shows no Kalan for a voided invoice', async () => {
    screenFor();
    await settle();
    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    fireEvent.click(row('AF-pi5'));
    await waitFor(() => expect(within(panel()).getByText('Kalan')).toBeTruthy());
    expect(within(panel()).getByText('Kalan').nextElementSibling?.textContent).toBe('—');
    fireEvent.click(within(panel()).getByRole('tab', { name: 'Ödemeler' }));
    expect(within(panel()).getByText('Kalan').nextElementSibling?.textContent).toBe('—');
  });

  it('a published tenant view keeps its columns (without the former ⋯ column)', async () => {
    overrides.set('/api/screen-views/purchase-invoices/active', () => ({
      id: 'v1',
      fields: [
        { key: 'code', label: 'Fatura', visible: true, position: 0 },
        { key: 'purchaseOrderCode', label: 'Sipariş no', visible: true, position: 1 },
        { key: 'status', label: 'Durum', visible: true, position: 2 },
        { key: 'actions', label: 'İşlemler', visible: true, position: 3 },
      ],
    }));
    screenFor();
    await settle();
    expect(Array.from(grid().querySelectorAll('thead tr:last-child th')).map((th) => th.textContent?.trim()).filter(Boolean)).toEqual([
      'Fatura', 'Sipariş no', 'Durum',
    ]);
  });

  it('a row click makes it current (no document opens); Aç, double-click and the code link open it', async () => {
    screenFor();
    await settle();
    expect(enabled('open')).toBe(false);
    fireEvent.click(row('AF-pi2'));
    await waitFor(() => expect(row('AF-pi2').getAttribute('aria-current')).toBe('true'));
    expect(document.querySelector('.doc-surface')).toBeNull();
    expect(fetched('/api/purchasing/invoices/pi2')).toBe(0);
    expect(reason('delete')).toContain('İşlenmiş belge silinemez — İşlemler › İptal et');
    await act(async () => {
      fireEvent.click(command('open'));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeNull());
    await act(async () => {
      fireEvent.doubleClick(cellOf(row('AF-pi3'), 'Tedarikçi'));
    });
    await waitFor(() => expect(fetched('/api/purchasing/invoices/pi3')).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeNull());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'AF-pi4 fatura ayrıntılarını aç' }));
    });
    await waitFor(() => expect(fetched('/api/purchasing/invoices/pi4')).toBe(1));
  });

  it('a double-click on the checkbox cell does not open the invoice', async () => {
    screenFor();
    await settle();
    await act(async () => {
      fireEvent.doubleClick(row('AF-pi2').querySelector('td.advanced-grid-select-cell')!);
    });
    await settle(50);
    expect(document.querySelector('.doc-surface')).toBeNull();
    expect(fetched('/api/purchasing/invoices/pi2')).toBe(0);
  });

  it('Yeni (F2) opens the receipt invoice entry; İşlemler holds both add paths', async () => {
    const onNavigate = vi.fn();
    screenFor(onNavigate);
    await settle();
    expect(command('new').getAttribute('data-primary')).toBe('true');
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-purchase-invoice-entry'));
    expect(menu().slice(0, 2)).toEqual(['Mal kabulünden fatura', 'Mal kabulsüz fatura']);
    await runMenu('Mal kabulsüz fatura');
    expect(onNavigate).toHaveBeenLastCalledWith('sales-purchase-invoice-drafts');
  });

  it('İşlemler carries the former row menu for the current row, with its conditions', async () => {
    screenFor();
    await settle();
    const rowItems = () => menu().slice(2, -1);
    expect(rowItems()).toEqual([]);
    fireEvent.click(row('AF-pi2'));
    await waitFor(() => expect(row('AF-pi2').getAttribute('aria-current')).toBe('true'));
    expect(rowItems()).toEqual(['Ödeme ekle', 'İade oluştur', 'İptal et (ters kayıt) (İptal için önce ödemeleri iptal edin.)']);
    fireEvent.click(row('AF-pi3'));
    await waitFor(() => expect(row('AF-pi3').getAttribute('aria-current')).toBe('true'));
    expect(rowItems()).toEqual(['İade oluştur', 'İptal et (ters kayıt) (İptal için önce ödemeleri iptal edin.)']);
    fireEvent.click(row('AF-pi5'));
    await waitFor(() => expect(row('AF-pi5').getAttribute('aria-current')).toBe('true'));
    expect(rowItems()).toEqual([]);
    expect(reason('delete')).toContain('İptal edilmiş belge silinemez');
    // An unpaid invoice can be cancelled: the document opens and asks first (its own confirmation).
    fireEvent.click(row('AF-pi4'));
    await waitFor(() => expect(row('AF-pi4').getAttribute('aria-current')).toBe('true'));
    expect(rowItems()).toEqual(['Ödeme ekle', 'İade oluştur', 'İptal et (ters kayıt)']);
    await runMenu('İptal et (ters kayıt)');
    expect(await screen.findByText('Alış faturası iptal edilsin mi?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    });
    expect(apiMock.mock.calls.some(([url]) => String(url).endsWith('/void'))).toBe(false);
  });

  it('the detail panel shows the current invoice: status and payment tags, amounts, chain, lines, payments', async () => {
    screenFor();
    await settle();
    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(panel().textContent).toContain('Özetini görmek için listeden bir alış faturası seçin.');
    fireEvent.click(row('AF-pi1'));
    await waitFor(() => expect(within(panel()).getByText('Kalan')).toBeTruthy());
    const p = within(panel());
    expect(p.getByRole('heading', { name: 'Ege Ambalaj Ltd.' })).toBeTruthy();
    expect(Array.from(panel().querySelectorAll('.nx-status-tag')).map((tag) => tag.textContent)).toEqual(['İşlendi', expect.stringMatching(/^Vadesi geçti · \d+ gün$/)]);
    expect(p.getByText('Genel toplam').nextElementSibling?.textContent).toBe('1.200,00 TRY');
    expect(p.getByText('Kalan').nextElementSibling?.className).toBe('is-bad');
    expect(p.getByText('Vade').nextElementSibling?.textContent).toBe('10.01.2020');
    const chain = Array.from(panel().querySelectorAll('.sales-ld-chain li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(chain).toEqual(['SA-0007 Satınalma siparişi', 'MK-pi1 Mal kabul', 'AF-pi1 Bu fatura']);
    expect(within(p.getByRole('region', { name: 'Satırlar' })).getByText('Koli 40x30')).toBeTruthy();
    fireEvent.click(row('AF-pi2'));
    await waitFor(() => expect(panel().textContent).toContain('Marmara Kimya'));
    await waitFor(() => expect(p.queryByText('Yükleniyor…')).toBeNull());
    fireEvent.click(within(panel()).getByRole('tab', { name: 'Ödemeler' }));
    expect(within(panel()).getByText('TO-1')).toBeTruthy();
    expect(within(panel()).getByText('Ödenen').nextElementSibling?.textContent).toBe('400,00 TRY');
  });

  it('ticked rows get the bulk bar with only Excel (seçilenler); an open invoice hides it', async () => {
    screenFor();
    await settle();
    fireEvent.click(within(row('AF-pi1')).getByRole('checkbox'));
    fireEvent.click(within(row('AF-pi2')).getByRole('checkbox'));
    const bulk = await screen.findByRole('toolbar', { name: 'Toplu işlemler' });
    expect(within(bulk).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Excel (seçilenler)', '✕ Esc']);
    expect(document.querySelector('.nx-list-footer')?.textContent).toContain('2 seçili');
    expect(enabled('open')).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'AF-pi3 fatura ayrıntılarını aç' }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    expect(screen.queryByRole('toolbar', { name: 'Toplu işlemler' })).toBeNull();
  });

  it('column widths fit the list beside the menu at 1440 (no horizontal scroll)', async () => {
    screenFor();
    await settle();
    const widths = Array.from(grid().querySelectorAll<HTMLElement>('thead tr:last-child th')).map((th) => parseFloat(th.style.width) || 0);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(1100);
  });
});

describe('Alış faturası document', () => {
  async function openInvoice(id: string) {
    screenFor();
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `AF-${id} fatura ayrıntılarını aç` }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface h1')?.textContent).toBe(`Alış faturası AF-${id}`));
    await settle(50);
  }

  it('moves the header buttons to İşlemler and owns the bar while it is open', async () => {
    await openInvoice('pi2');
    const head = document.querySelector('.doc-surface h1')!.closest('header')!;
    // Only the back button stays in the header.
    expect(within(head).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Geri']);
    expect(menu()).toEqual(['Ödeme ekle', 'İade oluştur', 'Faturayı iptal et (ters kayıt) (İptal için önce ödemeleri iptal edin.)']);
    expect(reason('delete')).toContain('İşlenmiş belge silinemez — İşlemler › Faturayı iptal et');
    expect(reason('export')).toContain('Belge açıkken kullanılamaz');
    expect(enabled('refresh')).toBe(true);
    // Flow: İşlendi (current); İptal only when voided. DetailTiles stay.
    const flow = document.querySelector<HTMLElement>('.doc-flow')!;
    expect(flow.querySelector('[aria-current="step"]')?.textContent).toContain('İşlendi');
    expect(flow.textContent).not.toContain('İptal');
    expect(screen.getByLabelText('Fatura özeti').textContent).toContain('Ödenen');
    // Context panel: chain and supplier.
    const chain = screen.getByRole('list', { name: 'Belge zinciri', hidden: true });
    expect(within(chain).getByText('SA-0007')).toBeTruthy();
    expect(within(chain).getByText('MK-pi2')).toBeTruthy();
    expect(within(chain).getByText('Bu fatura')).toBeTruthy();
    expect(screen.getByText('Unvan').nextElementSibling?.textContent).toBe('Marmara Kimya');
    await runMenu('Ödeme ekle');
    expect(await screen.findByRole('dialog', { name: 'Tedarikçi ödemesi' })).toBeTruthy();
  });

  it('an unpaid invoice can be cancelled from İşlemler (confirmation first); a voided one has no actions', async () => {
    await openInvoice('pi4');
    expect(menu()).toEqual(['Ödeme ekle', 'İade oluştur', 'Faturayı iptal et (ters kayıt)']);
    await runMenu('Faturayı iptal et (ters kayıt)');
    expect(await screen.findByText('Alış faturası iptal edilsin mi?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    });
    cleanup();
    await openInvoice('pi5');
    expect(menu()).toEqual([]);
    expect(reason('delete')).toContain('İptal edilmiş belge silinemez');
    expect(document.querySelector('.doc-flow [aria-current="step"]')?.textContent).toContain('İptal');
  });

  it('Yeni (F2) on the open invoice still opens the receipt invoice entry', async () => {
    const onNavigate = vi.fn();
    renderScreen(<PurchaseInvoicesPage token="t" role="TenantUser" onNavigate={onNavigate} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'AF-pi1 fatura ayrıntılarını aç' }));
    });
    await waitFor(() => expect(document.querySelector('.doc-surface')).not.toBeNull());
    fireEvent.keyDown(window, { key: 'F2' });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('sales-purchase-invoice-entry'));
  });
});

describe('English', () => {
  it('has an entry for every new purchase invoice text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    const texts = [
      'Fatura toplamı', 'Ödenmemiş', 'Vadesi geçen', 'fatura', 'bu sayfa', 'Kısmen ödendi', 'Ödendi', 'Vadesi geçti', 'İşlendi',
      'Tarih', 'Vade', 'Genel toplam', 'Kalan', 'Ödenen', '· 4 gün geçti', 'Vadesi geçti · 4 gün', 'Alış faturası özeti',
      'Özetini görmek için listeden bir alış faturası seçin.', 'Ödemeler', 'Satınalma siparişi', 'Mal kabul', 'Alış iadesi',
      'Mal kabulünden fatura', 'Mal kabulsüz fatura', 'Ödeme ekle', 'İade oluştur', 'İptal et (ters kayıt)', 'Faturayı iptal et (ters kayıt)',
      'İptal için önce ödemeleri iptal edin.', 'İşlenmiş belge silinemez — İşlemler › İptal et',
      'İşlenmiş belge silinemez — İşlemler › Faturayı iptal et', 'İptal edilmiş belge silinemez', 'Tedarikçi', 'Unvan',
      'Alış faturası listesi', 'Alış faturası kayıtları', 'AF-pi1 fatura ayrıntılarını aç', 'Henüz ödeme yok.',
    ];
    expect(JSON.stringify(texts.filter((text) => localizedUiText(text) === text))).toBe('[]');
  });
});
