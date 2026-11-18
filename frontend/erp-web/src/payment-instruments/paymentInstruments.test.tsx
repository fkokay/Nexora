import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { localDateString } from '../dateUtils';
import PaymentInstrumentsPage from '../PaymentInstrumentsPage';

const item = (id: string, code: string, type: string, direction: string, status: string, instrumentNumber: string) => ({
  id, code, type, direction, status, instrumentNumber, counterpartyName: 'Akdeniz Market Ltd.', counterpartyAccountId: null, bankName: 'Ziraat',
  currencyCode: 'TRY', amount: 12500, issueDate: '2026-11-01', dueDate: '2026-12-15', portfolioDate: '2026-11-02', endorsedTo: null,
  endorsedAt: null, collectedAt: null, financialAccountId: null, notes: null, rowVersion: `rv-${id}`, createdAt: '2026-11-02T09:00:00Z',
});
const receivable = [
  item('i1', 'CS-0001', 'Check', 'Receivable', 'Portfolio', 'CK-1001'),
  item('i2', 'CS-0002', 'PromissoryNote', 'Receivable', 'Bounced', 'SN-2001'),
];
const payable = [item('i3', 'CS-0003', 'Check', 'Payable', 'Portfolio', 'CK-3001')];
const accounts = [
  { id: 'f1', name: 'Merkez kasa', code: 'KASA-01', type: 'Cash', currencyCode: 'TRY', isActive: true },
  { id: 'f2', name: 'Döviz kasası', code: 'KASA-USD', type: 'Cash', currencyCode: 'USD', isActive: true },
];
let listTotal = 2;

const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
function respond(url: string, method: string): unknown {
  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname;
  if (path === '/api/finance/payment-instruments/' && method === 'GET') {
    const rows = parsed.searchParams.get('direction') === 'Payable' ? payable : receivable;
    const pageSize = Number(parsed.searchParams.get('pageSize'));
    return { items: rows.slice(0, pageSize), page: 1, pageSize, totalCount: pageSize === 25 ? listTotal : rows.length, summary: { openByCurrency: [{ currencyCode: 'TRY', amount: 12500 }], dueCount: 0, bouncedCount: 0 } };
  }
  if (/^\/api\/finance\/payment-instruments\/[^/]+\/events$/.test(path)) return [];
  if (/^\/api\/finance\/payment-instruments\//.test(path)) return { ok: true };
  if (path === '/api/finance/accounts') return accounts;
  if (path === '/api/finance/currency') return { baseCurrencyCode: 'TRY' };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path === '/api/customers/') return { items: [] };
  return {};
}
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    fetchCalls.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(respond(String(url), method)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }),
}));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  fetchCalls.length = 0;
  listTotal = 2;
  sessionStorage.clear();
  localStorage.clear();
});
function renderScreen(node: ReactNode) {
  return render(
    <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={['v']}>{node}</KeepAliveViews>
      <ConfirmDialogHost />
    </CommandProvider>,
  );
}
async function settle(ms = 400) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const LIST = '/api/finance/payment-instruments/';
const listUrls = () => fetchCalls.filter((call) => call.method === 'GET' && call.url.startsWith(`${LIST}?`)).map((call) => call.url.slice(LIST.length + 1));
const mainListUrls = () => listUrls().filter((query) => query.includes('pageSize=25'));
const posts = () => fetchCalls.filter((call) => call.method === 'POST').map(({ url, body }) => ({ url, body }));
const today = localDateString();
const soon = (() => {
  const [y, m, d] = today.split('-').map(Number);
  const value = new Date(y, m - 1, d + 30);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
})();
async function answerDialog(text: string | null, confirmLabel: string) {
  const dialog = screen.getByRole('alertdialog');
  if (text !== null) {
    const field = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>('textarea, input')!;
    fireEvent.change(field, { target: { value: text } });
  }
  fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }));
  await settle(50);
}

// --- Interaction steps (the only part that follows the UI) ---
// Yeni is the İşlem Çubuğu command; the record actions are in İşlemler and apply to the selected row.
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
function menuItems() {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"][data-item^="pi-"]')];
}
const closeMenu = () => {
  if (document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
};
const ACTION_IDS: Record<string, string> = { 'Tahsil et': 'pi-collect', 'Ciro et': 'pi-endorse', 'Karşılıksız': 'pi-bounce', 'İptal': 'pi-cancel' };
async function selectRow(instrumentNumber: string) {
  fireEvent.click(screen.getAllByText(instrumentNumber)[0].closest('tr')!);
  await settle(100);
}
async function runAction(label: string) {
  fireEvent.click(menuItems().find((node) => node.dataset.item === ACTION_IDS[label])!);
  await settle(50);
}
function chooseAccount(code: string, accountId: string) {
  fireEvent.change(screen.getByLabelText(`${code} finans hesabı`), { target: { value: accountId } });
}
async function chip(name: RegExp) {
  fireEvent.click(screen.getAllByRole('button', { name }).find((node) => node.closest('.list-v2-toolbar'))!);
  await settle();
}
async function search(text: string) {
  const box = screen.getByPlaceholderText('Çek/senet no, portföy kodu veya cari ara');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
  fireEvent.submit(box.closest('form') ?? box);
  await settle(600);
}
async function directionTab(name: RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
  await settle();
}
async function nextPage() {
  fireEvent.click(document.querySelector<HTMLElement>('.pi-pagination button:last-child')!);
  await settle();
}
async function startCreate() {
  fireEvent.click(bar().querySelector<HTMLElement>('[data-command="new"]')!);
  await settle(100);
}
async function submitCreate() {
  fireEvent.submit(screen.getByLabelText(/Çek\/senet numarası/).closest('form')!);
  await settle();
}
const formField = (label: RegExp) => screen.getAllByLabelText(label).find((node) => node.closest('form') && node.tagName === 'INPUT')!;
const createAvailable = () => bar().querySelector<HTMLElement>('[data-command="new"]')?.getAttribute('aria-disabled') !== 'true';
const actionLabels = () => {
  const labels = menuItems()
    .filter((node) => node.getAttribute('aria-disabled') !== 'true')
    .map((node) => Object.keys(ACTION_IDS).find((label) => ACTION_IDS[label] === node.dataset.item));
  closeMenu();
  return labels;
};
// ---

describe('Çek ve Senet (characterization)', () => {
  it('on mount: the list, accounts, portfolio tiles, tab / status counts, screen view, base currency and the first row history', async () => {
    renderScreen(<PaymentInstrumentsPage token="t" role="TenantAdmin" />);
    await settle(900);
    expect(mainListUrls()).toEqual(['page=1&pageSize=25&direction=Receivable']);
    expect(new Set(listUrls().filter((query) => query.includes('pageSize=1&')))).toEqual(new Set([
      'page=1&pageSize=1&direction=Receivable&status=Portfolio',
      'page=1&pageSize=1&direction=Payable&status=Portfolio',
      `page=1&pageSize=1&direction=Receivable&status=Portfolio&dueFrom=${today}&dueTo=${soon}`,
      `page=1&pageSize=1&direction=Payable&status=Portfolio&dueFrom=${today}&dueTo=${soon}`,
      'page=1&pageSize=1&status=Bounced',
      'page=1&pageSize=1&direction=Payable',
      'page=1&pageSize=1&direction=Receivable&status=Portfolio',
      'page=1&pageSize=1&direction=Receivable&status=Endorsed',
      'page=1&pageSize=1&direction=Receivable&status=Collected',
      'page=1&pageSize=1&direction=Receivable&status=Bounced',
      'page=1&pageSize=1&direction=Receivable&status=Cancelled',
    ]));
    const gets = fetchCalls.filter((call) => call.method === 'GET').map((call) => call.url);
    expect(gets).toContain('/api/finance/accounts');
    expect(gets).toContain('/api/screen-views/payment-instruments/active');
    expect(gets).toContain('/api/finance/currency');
    expect(gets).toContain('/api/finance/payment-instruments/i1/events');
  });

  it('status, type, search, direction and paging change the list query', async () => {
    listTotal = 30;
    renderScreen(<PaymentInstrumentsPage token="t" role="TenantAdmin" />);
    await settle(900);
    await chip(/^Karşılıksız/);
    expect(mainListUrls().at(-1)).toBe('page=1&pageSize=25&direction=Receivable&status=Bounced');
    await chip(/^Çek/);
    expect(mainListUrls().at(-1)).toBe('page=1&pageSize=25&direction=Receivable&status=Bounced&type=Check');
    await search('Akdeniz');
    expect(mainListUrls().at(-1)).toBe('page=1&pageSize=25&direction=Receivable&status=Bounced&type=Check&term=Akdeniz');
    await directionTab(/Verilen/);
    expect(mainListUrls().at(-1)).toBe('page=1&pageSize=25&direction=Payable&type=Check&term=Akdeniz');
    await nextPage();
    expect(mainListUrls().at(-1)).toBe('page=2&pageSize=25&direction=Payable&type=Check&term=Akdeniz');
  });

  it('a new instrument POSTs the draft (free-text counterparty) with a request id, then the list reloads', async () => {
    renderScreen(<PaymentInstrumentsPage token="t" role="TenantAdmin" />);
    await settle(900);
    await startCreate();
    fireEvent.change(screen.getByLabelText(/Çek\/senet numarası/), { target: { value: 'CK-9001' } });
    fireEvent.click(screen.getByLabelText('Kayıtlı olmayan cari'));
    fireEvent.change(screen.getByLabelText(/Cari unvanı/), { target: { value: 'Yeni Cari Ltd.' } });
    fireEvent.change(formField(/^Banka/), { target: { value: 'Garanti' } });
    fireEvent.change(formField(/^Tutar/), { target: { value: '1500' } });
    const before = mainListUrls().length;
    await submitCreate();
    expect(posts()).toEqual([{ url: LIST, body: {
      type: 'Check', direction: 'Receivable', instrumentNumber: 'CK-9001', counterpartyName: 'Yeni Cari Ltd.', bankName: 'Garanti',
      currencyCode: 'TRY', amount: 1500, issueDate: today, dueDate: today, portfolioDate: today, notes: '',
      counterpartyAccountId: null, requestId: expect.any(String),
    } }]);
    expect(mainListUrls().length).toBe(before + 1);
  });

  it('collect needs an account (no request without one), then POSTs the account and the event date', async () => {
    renderScreen(<PaymentInstrumentsPage token="t" role="TenantAdmin" />);
    await settle(900);
    await selectRow('CK-1001');
    await runAction('Tahsil et');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posts()).toEqual([]);
    expect(screen.getByText('Tahsilat/ödeme için finans hesabı seçin.')).toBeTruthy();
    chooseAccount('CS-0001', 'f1');
    await runAction('Tahsil et');
    await answerDialog(null, 'Devam');
    await settle();
    expect(posts()).toEqual([{ url: '/api/finance/payment-instruments/i1/collect', body: {
      requestId: expect.any(String), rowVersion: 'rv-i1', eventDate: today, financialAccountId: 'f1', endorsedTo: null, note: null,
    } }]);
  });

  it('endorse asks for a note and the endorsee; bounce requires a note; cancel asks again', async () => {
    renderScreen(<PaymentInstrumentsPage token="t" role="TenantAdmin" />);
    await settle(900);
    await selectRow('CK-1001');
    await runAction('Ciro et');
    await answerDialog('Ciro notu', 'Devam');
    await answerDialog('Ege Gıda A.Ş.', 'Ciro et');
    await settle();
    await selectRow('CK-1001');
    await runAction('Karşılıksız');
    await answerDialog('Yetersiz bakiye', 'Karşılıksız işaretle');
    await settle();
    await selectRow('CK-1001');
    await runAction('İptal');
    await answerDialog('', 'Devam');
    await answerDialog(null, 'İptal et');
    await settle();
    const common = { requestId: expect.any(String), rowVersion: 'rv-i1', eventDate: today, financialAccountId: null };
    expect(posts()).toEqual([
      { url: '/api/finance/payment-instruments/i1/endorse', body: { ...common, endorsedTo: 'Ege Gıda A.Ş.', note: 'Ciro notu' } },
      { url: '/api/finance/payment-instruments/i1/bounce', body: { ...common, endorsedTo: null, note: 'Yetersiz bakiye' } },
      { url: '/api/finance/payment-instruments/i1/cancel', body: { ...common, endorsedTo: null, note: null } },
    ]);
  });

  it('a bounced instrument offers only collect; a company user gets no create and no actions', async () => {
    const first = renderScreen(<PaymentInstrumentsPage token="t" role="TenantAdmin" />);
    await settle(900);
    await selectRow('SN-2001');
    expect(actionLabels()).toEqual(['Tahsil et']);
    first.unmount();
    renderScreen(<PaymentInstrumentsPage token="t" role="TenantUser" />);
    await settle(900);
    await selectRow('CK-1001');
    expect(createAvailable()).toBe(false);
    expect(actionLabels()).toEqual([]);
    expect(posts()).toEqual([]);
  });
});
