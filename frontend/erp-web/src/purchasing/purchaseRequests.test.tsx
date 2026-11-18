import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { loadEnglishDictionaries, localizedUiText } from '../locale';
import SalesRequestsPage from '../SalesRequestsPage';
import PurchaseSupplierQuotesPage from '../PurchaseSupplierQuotesPage';
import { PurchaseRequestFlow, purchaseRequestListTag } from './purchaseRequestList';
import { purchaseQuoteListTag } from './purchaseQuoteList';
import { commandReason } from '../action-bar/commandReason';

/*
 * Satınalma Talepleri ve Teklifleri on the list / document type (Faz 4 Task 2): the list (cards from the per-status
 * counts, chips, tags, panel, İşlemler with the row menu's conditions), the request document (flow, sections,
 * İşlemler) and the read-only quote list whose Aç opens the request.
 */

const b64 = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = `${b64({ alg: 'none' })}.${b64({ sub: 'u-admin' })}.x`;
const page = <T,>(items: T[], totalCount = items.length) => ({ items, page: 1, pageSize: 25, totalCount });
const request = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code: `ST-${id}`, requestDate: '2026-11-01', neededByDate: '2026-12-20', description: `Talep ${id}`,
  requestedByUserId: 'u-other', requestedByName: 'Ayşe Demir', status, reviewedByUserId: null, reviewedByName: null,
  reviewNote: null, createdAt: '2026-11-01', reviewedAt: null, lineCount: 2, purchaseOrderId: null, purchaseOrderCode: null, ...extra,
});
const requests = [
  request('r1', 'Submitted'),
  request('r2', 'Approved', { reviewedByName: 'Fatih Yönetici' }),
  request('r3', 'Ordered', { purchaseOrderId: 'po1', purchaseOrderCode: 'SA-0001', reviewedByName: 'Fatih Yönetici' }),
  request('r4', 'Rejected', { reviewedByName: 'Fatih Yönetici', reviewNote: 'Bütçe yok' }),
  request('r5', 'Submitted', { requestedByUserId: 'u-admin', requestedByName: 'Fatih Yönetici' }),
];
const counts: Record<string, number> = { '': 5, Submitted: 2, Approved: 1, Ordered: 1, Rejected: 1 };
const detailOf = (id: string) => {
  const { lineCount: _lineCount, ...summary } = requests.find((item) => item.id === id)!;
  return {
    ...summary,
    lines: [
      { lineNumber: 1, stockItemId: 's1', stockCode: 'AMB-2040', stockName: 'Koli 40×30×30', unitCode: 'ADET', quantity: 200 },
      { lineNumber: 2, stockItemId: 's2', stockCode: 'AMB-3100', stockName: 'Streç film', unitCode: 'RULO', quantity: 10 },
    ],
    customFields: [],
  };
};
const supplierQuote = {
  id: 'q1', purchaseRequestId: 'r2', requestCode: 'ST-r2', code: 'TKL-77', supplierId: 'sup1', supplierName: 'Ege Ambalaj',
  quoteDate: '2026-11-03', validUntil: '2099-12-31', currencyCode: 'TRY', status: 'Submitted', subtotal: 1000, discountTotal: 0,
  taxTotal: 200, grandTotal: 1200, notes: null, createdAt: '2026-11-03', baseCurrencyCode: 'TRY', comparableGrandTotal: 1200,
  appliedExchangeRate: null, appliedRateDate: null, customFields: [],
  lines: [{ requestLineNumber: 1, stockCode: 'AMB-2040', stockName: 'Koli 40×30×30', unitCode: 'ADET', quantity: 200, unitPrice: 5, discountPercent: 0, vatPercent: 20, lineSubtotal: 1000, discountAmount: 0, taxAmount: 200, lineTotal: 1200 }],
};
const listQuote = (id: string, status: string) => ({
  id, purchaseRequestId: 'r2', requestCode: 'ST-r2', code: `TKL-${id}`, supplierId: 'sup1', supplierName: 'Ege Ambalaj',
  quoteDate: '2026-11-03', validUntil: '2026-11-30', currencyCode: 'TRY', status, grandTotal: 1200, lineCount: 1, createdAt: '2026-11-03T10:00:00Z',
});

const calls: Array<{ url: string; method: string; body?: string }> = [];

function respond(url: string): unknown {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  if (path === '/api/purchasing/requests/') {
    const status = params.get('status') ?? '';
    if (params.get('pageSize') === '1') return page([], counts[status] ?? 0);
    const items = status ? requests.filter((item) => item.status === status) : requests;
    return page(items);
  }
  const match = /^\/api\/purchasing\/requests\/(r\d)$/.exec(path);
  if (match) return detailOf(match[1]);
  if (path === '/api/purchasing/requests/r2/supplier-quotes' || path === '/api/purchasing/requests/r3/supplier-quotes') return [supplierQuote];
  if (path === '/api/purchasing/supplier-quotes/') return page([listQuote('a', 'Submitted'), listQuote('b', 'Selected'), listQuote('c', 'NotSelected')]);
  if (path === '/api/warehouses/') return [{ id: 'w1', code: 'D1', name: 'Ana depo', isActive: true }];
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
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

async function openRequestList(role = 'TenantAdmin') {
  renderScreen(<SalesRequestsPage token={token} role={role} onNavigate={vi.fn()} />);
  await waitFor(() => expect(within(grid()).getByText('ST-r1')).toBeTruthy());
  await settle();
}

describe('purchase request / quote tags and flow', () => {
  it('maps the statuses to the list tones of mockup 07', () => {
    expect(purchaseRequestListTag('Submitted')).toEqual({ tone: 'warn', label: 'Onay bekliyor' });
    expect(purchaseRequestListTag('Approved')).toEqual({ tone: 'info', label: 'Onaylandı' });
    expect(purchaseRequestListTag('Ordered')).toEqual({ tone: 'ok', label: 'Siparişe dönüştü' });
    expect(purchaseRequestListTag('Rejected')).toEqual({ tone: 'off', label: 'Reddedildi' });
    expect(purchaseQuoteListTag('Submitted')).toEqual({ tone: 'warn', label: 'Değerlendirmede' });
    expect(purchaseQuoteListTag('Selected')).toEqual({ tone: 'ok', label: 'Seçildi' });
    expect(purchaseQuoteListTag('NotSelected')).toEqual({ tone: 'off', label: 'Seçilmedi' });
  });

  it('draws Onay bekliyor → Onaylandı → Siparişe dönüştü, Reddedildi only as the end state', () => {
    const { rerender } = render(<PurchaseRequestFlow status="Approved" />);
    const steps = () => Array.from(document.querySelectorAll('.doc-flow-step')).map((step) => `${step.querySelector('span')?.textContent}${step.getAttribute('aria-current') ? '*' : ''}`);
    expect(steps()).toEqual(['Onay bekliyor', 'Onaylandı*', 'Siparişe dönüştü']);
    rerender(<PurchaseRequestFlow status="Rejected" />);
    expect(steps()).toEqual(['Onay bekliyor', 'Onaylandı', 'Siparişe dönüştü', 'Reddedildi*']);
  });
});

describe('Satınalma Talepleri list', () => {
  it('shows the list type: status cards from the per-status counts, chips, tags, checkbox column, footer', async () => {
    await openRequestList();
    expect(screen.getByRole('heading', { name: /Satınalma talepleri/ })).toBeTruthy();
    expect(cards()).toEqual([
      'Onay bekliyor 2 tüm talepler',
      'Onaylandı 1 tüm talepler',
      'Siparişe dönüştü 1 tüm talepler',
      'Reddedildi 1 tüm talepler',
    ]);
    // Chip counts: one pageSize=1 call per status (unchanged).
    const countCalls = calls.filter((call) => call.url.startsWith('/api/purchasing/requests/?') && call.url.includes('pageSize=1&') || call.url.endsWith('pageSize=1'));
    expect(countCalls.map((call) => new URLSearchParams(call.url.split('?')[1]).get('status') ?? '').sort()).toEqual(['', 'Approved', 'Ordered', 'Rejected', 'Submitted']);
    expect(screen.getByRole('checkbox', { name: 'Tümünü seç' })).toBeTruthy();
    expect(tagOf(row('ST-r1'))?.className).toContain('is-warn');
    expect(tagOf(row('ST-r2'))?.className).toContain('is-info');
    expect(tagOf(row('ST-r3'))?.className).toContain('is-ok');
    expect(tagOf(row('ST-r4'))?.className).toContain('is-off');
    const footer = document.querySelector<HTMLElement>('.nx-list-footer')!;
    expect(footer.textContent).toContain('Enter aç');
    expect(footer.textContent).toContain('5 / 5');
    // No implicit current row: Aç waits for a choice; the header has no buttons (Yeni is the bar's).
    expect(enabled('open')).toBe(false);
    expect(reason('open')).toContain('Önce bir kayıt seçin');
    expect(enabled('new')).toBe(true);
    expect(document.querySelector('.list-v2-heading button')).toBeNull();
  });

  it('a status card filters the list with the server filter (the same as its chip)', async () => {
    await openRequestList();
    fireEvent.click(document.querySelectorAll<HTMLElement>('.nx-summary-item')[0]);
    await settle(400);
    expect(calls.some((call) => call.url.includes('status=Submitted') && call.url.includes('pageSize=25'))).toBe(true);
    expect(within(grid()).queryByText('ST-r2')).toBeNull();
  });

  it('a click makes the row current (panel shows it, nothing opens); İşlemler mirrors the row menu with its conditions', async () => {
    await openRequestList();
    fireEvent.click(row('ST-r1').querySelectorAll('td')[2]);
    expect(document.querySelector('.doc-surface')).toBeNull();
    if (!panel()) togglePanel();
    await settle();
    expect(panel()?.textContent).toContain('ST-r1');
    expect(panel()?.textContent).toContain('Ayşe Demir');
    expect(within(panel()!).getByRole('button', { name: 'Onayla' })).toBeTruthy();
    expect(openMenu()).toEqual(['Onayla', 'Reddet', 'Alanlar', 'CSV olarak dışa aktar']);
    // Own request: no decision (self-approval is blocked).
    fireEvent.click(row('ST-r5').querySelectorAll('td')[2]);
    await settle();
    expect(openMenu()).toEqual(['Alanlar', 'CSV olarak dışa aktar']);
    expect(panel()?.textContent).toContain('Kendi talebinizi onaylayamaz');
    fireEvent.click(row('ST-r2').querySelectorAll('td')[2]);
    await settle();
    expect(openMenu()).toEqual(['Teklif ekle', 'Siparişe dönüştür', 'Alanlar', 'CSV olarak dışa aktar']);
    fireEvent.click(row('ST-r3').querySelectorAll('td')[2]);
    await settle();
    expect(openMenu()).toEqual(['Siparişi aç', 'Alanlar', 'CSV olarak dışa aktar']);
    expect(panel()?.textContent).toContain('SA-0001');
    // The linked order opens from the Sipariş fact and from the document chain.
    expect(within(panel()!).getAllByRole('button', { name: 'SA-0001' })).toHaveLength(2);
  });

  it('TenantUser gets no decision, quote or conversion items', async () => {
    await openRequestList('TenantUser');
    fireEvent.click(row('ST-r1').querySelectorAll('td')[2]);
    await settle();
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
    fireEvent.click(row('ST-r2').querySelectorAll('td')[2]);
    await settle();
    expect(openMenu()).toEqual(['CSV olarak dışa aktar']);
  });

  it('a double click on the checkbox cell does not open; a double click on the row opens the document', async () => {
    await openRequestList();
    fireEvent.doubleClick(row('ST-r2').querySelector('.advanced-grid-select-cell')!);
    await settle();
    expect(document.querySelector('.doc-surface')).toBeNull();
    fireEvent.doubleClick(row('ST-r2').querySelectorAll('td')[3]);
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeTruthy());
    await settle();
    expect(flowSteps()).toEqual(['Onay bekliyor', 'Onaylandı*', 'Siparişe dönüştü']);
    // Document-open commands: the hidden list's Excel / Filtre do not act.
    expect(enabled('export')).toBe(false);
    expect(reason('export')).toContain('Belge açıkken kullanılamaz');
    expect(enabled('filter')).toBe(false);
    expect(openMenu()).toEqual(['Teklif ekle', 'Siparişe dönüştür']);
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    expect(within(surface).getByRole('button', { name: 'Bu teklifle sipariş' })).toBeTruthy();
    // The quote is a row of the quotes section and a link of the document chain.
    expect(within(surface.querySelector<HTMLElement>('.pr-detail-quotes')!).getByText('TKL-77')).toBeTruthy();
    expect(within(surface.querySelector<HTMLElement>('.dd-chain')!).getByText('TKL-77')).toBeTruthy();
    // The header carries no workflow buttons.
    expect(Array.from(surface.querySelectorAll('header.doc-surface-head button')).map((b) => b.textContent?.trim()).filter(Boolean)).not.toContain('Teklif ekle');
    // İşlemler › Teklif ekle opens the quote form in the quotes section.
    runMenu('Teklif ekle');
    await settle();
    expect(surface.querySelector('.pr-detail-quotes form')).toBeTruthy();
    expect(within(surface).getByRole('button', { name: 'Teklifi kaydet' })).toBeTruthy();
  });

  it('Reddedildi is the end state of a rejected request; Siparişi aç is in İşlemler of an ordered one', async () => {
    await openRequestList();
    fireEvent.doubleClick(row('ST-r4').querySelectorAll('td')[3]);
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeTruthy());
    await settle();
    expect(flowSteps()).toEqual(['Onay bekliyor', 'Onaylandı', 'Siparişe dönüştü', 'Reddedildi*']);
    expect(document.querySelector('.doc-surface')!.textContent).toContain('Bütçe yok');
    expect(command('more').getAttribute('aria-disabled') === 'true' || openMenu().length === 0).toBe(true);
  });

  it('Onayla from İşlemler opens the request and asks for confirmation in its decision section', async () => {
    await openRequestList();
    fireEvent.click(row('ST-r1').querySelectorAll('td')[2]);
    await settle();
    runMenu('Onayla');
    await waitFor(() => expect(document.querySelector('.doc-surface .pr-detail-decision')).toBeTruthy());
    const surface = document.querySelector<HTMLElement>('.doc-surface')!;
    expect(within(surface).getByText('Bu talep onaylansın mı?')).toBeTruthy();
    fireEvent.click(within(surface).getByRole('button', { name: 'Evet, onayla' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url === '/api/purchasing/requests/r1/decision')).toBe(true));
    expect(JSON.parse(calls.find((call) => call.method === 'POST')!.body!)).toEqual({ approved: true, note: null });
  });
});

describe('Satınalma Teklifleri list', () => {
  it('is read-only on the list type; Aç opens the quote\'s request in Satınalma talepleri', async () => {
    const onOpenRequests = vi.fn();
    renderScreen(<PurchaseSupplierQuotesPage token={token} onOpenRequests={onOpenRequests} />);
    await waitFor(() => expect(within(grid()).getByText('TKL-a')).toBeTruthy());
    expect(tagOf(row('TKL-a'))?.className).toContain('is-warn');
    expect(tagOf(row('TKL-b'))?.className).toContain('is-ok');
    expect(tagOf(row('TKL-c'))?.className).toContain('is-off');
    expect(command('new')).toBeNull();
    expect(enabled('open')).toBe(false);
    expect(openMenu()).toEqual(['Talep üzerinden teklif gir', 'CSV olarak dışa aktar']);
    fireEvent.click(row('TKL-a').querySelectorAll('td')[3]);
    expect(enabled('open')).toBe(true);
    fireEvent.click(command('open'));
    expect(onOpenRequests).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('nexora.purchase-request.open')).toBe('r2');
  });

  it('the request list opens the request it was asked to open', async () => {
    sessionStorage.setItem('nexora.purchase-request.open', 'r2');
    renderScreen(<SalesRequestsPage token={token} role="TenantAdmin" onNavigate={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.doc-surface')).toBeTruthy());
    expect(document.querySelector('.doc-surface')!.textContent).toContain('ST-r2');
    expect(sessionStorage.getItem('nexora.purchase-request.open')).toBeNull();
  });
});

describe('English', () => {
  it('has an entry for every new purchasing list / document text', async () => {
    localStorage.setItem('aierp.locale', 'en');
    await loadEnglishDictionaries();
    for (const text of [
      'Satınalma talebi özeti', 'Satınalma teklifi özeti', 'Satınalma siparişi özeti', 'Satınalma talebi kayıtları',
      'Satınalma siparişi kayıtları', 'en iyi', 'aramayla eşleşen', 'tüm talepler', 'Mal bekleyen', 'Kıyas', 'Mal kabuller',
      'Teklif bulunamadı.', 'TKL-1 kalem fiyatları', 'Kısmen alındı', 'Gecikmiş', 'Talep kararı', 'Tedarikçi teklifi',
      'Faturalanan', 'Beklenen teslim', 'Talep üzerinden teklif gir', 'Değerlendiriliyor', 'ST-1 talep ayrıntılarını aç',
      'SA-1 sipariş ayrıntılarını aç', '4 gün geçti', 'bu sayfa · iptaller hariç',
    ])
      expect(localizedUiText(text), text).not.toBe(text);
  });
});
