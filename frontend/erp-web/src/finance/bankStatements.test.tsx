import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import BankStatementsPage from '../BankStatementsPage';

const account = { id: 'b1', code: 'BNK-01', name: 'Ana banka', type: 'Bank', currencyCode: 'TRY', balance: 1000, transactionCount: 4, isActive: true, createdAt: '2026-01-02T09:00:00Z' };
const summary = (id: string, code: string, status: 'Imported' | 'Reconciled', lineCount: number, matchedLineCount: number) => ({
  id, code, accountId: 'b1', accountName: 'Ana banka', currencyCode: 'TRY', startDate: '2026-11-01', endDate: '2026-11-15',
  openingBalance: 1000, closingBalance: 1500, lineCount, matchedLineCount, status, createdAt: '2026-11-16T09:00:00Z',
});
const statements = [summary('s1', 'BE-2026-0001', 'Imported', 2, 0), summary('s2', 'BE-2026-0002', 'Imported', 1, 1)];
const line = (id: string, lineNumber: number, amount: number, matched: string | null) => ({
  id, lineNumber, externalId: null, transactionDate: '2026-11-05', direction: 'Inflow', amount, description: `Satır ${lineNumber}`,
  reference: null, financialAccountTransactionId: matched, isBookEntryCreated: false, matchedAt: matched ? '2026-11-16T10:00:00Z' : null,
});
const details: Record<string, unknown> = {
  s1: { ...summary('s1', 'BE-2026-0001', 'Imported', 2, 0), lines: [line('l1', 1, 300, null), line('l2', 2, 200, null)] },
  s2: { ...summary('s2', 'BE-2026-0002', 'Imported', 1, 1), lines: [line('l3', 1, 500, 'm9')] },
};
const unmatched = [{ id: 'm1', transactionDate: '2026-11-05', direction: 'Inflow', amount: 300, currencyCode: 'TRY', description: 'Tahsilat', reference: null, sourceType: 'Müşteri tahsilatı', sourceCode: 'TAH-1' }];

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/accounts') return [account];
  if (path === '/api/finance/statements') return statements;
  const detail = path.match(/^\/api\/finance\/statements\/([^/]+)$/);
  if (detail) return details[detail[1]];
  if (/^\/api\/finance\/statements\/[^/]+\/unmatched-book-movements$/.test(path)) return unmatched;
  if (/\/auto-match$/.test(path)) return { matched: 1, remaining: 1, ambiguous: 0 };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return {};
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
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
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
async function settle(ms = 350) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
/** Requests to `path` (exact, without query), in order, as { method, body }. */
const calls = (path: string) =>
  apiMock.mock.calls
    .map(([url, , init]) => ({ url: String(url), init: init as RequestInit | undefined }))
    .filter(({ url }) => url.split('?')[0] === path)
    .map(({ init }) => ({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined }));

// --- Interaction steps (the only part that follows the UI) ---
// The list opens a statement on the detail surface; its commands are in İşlemler (the line ones act on the selected line).
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
async function runMenu(id: string) {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  fireEvent.click(document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!);
  await settle();
}
async function openStatement(code: string) {
  const back = screen.queryByRole('button', { name: 'Listeye dön' });
  if (back) {
    fireEvent.click(back);
    await settle(50);
  }
  fireEvent.click(screen.getByRole('button', { name: new RegExp(code) }));
  await settle();
}
async function autoMatch() {
  await runMenu('statement-auto-match');
}
async function matchLine(lineNumber: number, movementId: string) {
  fireEvent.change(screen.getByLabelText(`${lineNumber}. satır için defter hareketi`), { target: { value: movementId } });
  await settle(50);
  await runMenu('statement-line-match');
}
async function postLine() {
  fireEvent.click(screen.getByText('Satır 2').closest('tr')!);
  await settle(50);
  await runMenu('statement-line-book');
}
async function reconcile() {
  await runMenu('statement-reconcile');
}
// ---

describe('Banka Ekstreleri (characterization)', () => {
  it('loads the accounts and statements, then a statement with its unmatched book movements', async () => {
    renderScreen(<BankStatementsPage token="t" role="TenantAdmin" />);
    await settle();
    // Mount loads the accounts and the statement list (both GET, no body).
    expect(calls('/api/finance/accounts').length).toBeGreaterThan(0);
    expect(calls('/api/finance/accounts').every((call) => call.method === 'GET' && call.body === undefined)).toBe(true);
    expect(calls('/api/finance/statements').length).toBeGreaterThan(0);
    expect(calls('/api/finance/statements').every((call) => call.method === 'GET' && call.body === undefined)).toBe(true);
    await openStatement('BE-2026-0001');
    expect(calls('/api/finance/statements/s1').length).toBeGreaterThan(0);
    expect(calls('/api/finance/statements/s1').every((call) => call.method === 'GET' && call.body === undefined)).toBe(true);
    expect(calls('/api/finance/statements/s1/unmatched-book-movements').length).toBe(calls('/api/finance/statements/s1').length);
    expect(calls('/api/finance/statements/s1/unmatched-book-movements').every((call) => call.method === 'GET')).toBe(true);
  });

  it('auto-match, line match and book entry send their POSTs, then reload the statement and the list', async () => {
    renderScreen(<BankStatementsPage token="t" role="TenantAdmin" />);
    await settle();
    await openStatement('BE-2026-0001');
    const lists = calls('/api/finance/statements').length;
    const opened = calls('/api/finance/statements/s1').length;
    await autoMatch();
    expect(calls('/api/finance/statements/s1/auto-match')).toEqual([{ method: 'POST', body: undefined }]);
    expect(calls('/api/finance/statements/s1').length).toBe(opened + 1);
    expect(calls('/api/finance/statements').length).toBe(lists + 1);
    await matchLine(1, 'm1');
    expect(calls('/api/finance/statements/s1/lines/l1/match')).toEqual([{ method: 'POST', body: { financialAccountTransactionId: 'm1' } }]);
    expect(calls('/api/finance/statements').length).toBe(lists + 2);
    await postLine();
    expect(calls('/api/finance/statements/s1/lines/l2/create-book-entry')).toEqual([{ method: 'POST', body: undefined }]);
    expect(calls('/api/finance/statements').length).toBe(lists + 3);
  });

  it('reconcile waits for every line to be matched, then sends POST /reconcile', async () => {
    renderScreen(<BankStatementsPage token="t" role="TenantAdmin" />);
    await settle();
    await openStatement('BE-2026-0001');
    await reconcile();
    expect(calls('/api/finance/statements/s1/reconcile')).toEqual([]);
    await openStatement('BE-2026-0002');
    await reconcile();
    expect(calls('/api/finance/statements/s2/reconcile')).toEqual([{ method: 'POST', body: undefined }]);
  });
});

describe('Banka Ekstreleri (list and statement surface)', () => {
  const item = (id: string) => document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!;
  const toggleMenu = () => fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  it('lists the statements without opening one; line commands follow the selected line', async () => {
    renderScreen(<BankStatementsPage token="t" role="TenantAdmin" />);
    await settle();
    expect(calls('/api/finance/statements/s1')).toEqual([]);
    const rows = Array.from(document.querySelectorAll('.list-v2-list tbody tr')).map((tr) => tr.textContent ?? '');
    expect(rows.some((text) => text.includes('BE-2026-0001') && text.includes('0 / 2') && text.includes('Bekliyor'))).toBe(true);
    // Yeni opens today's import form (no request until it is submitted).
    fireEvent.click(bar().querySelector<HTMLElement>('[data-command="new"]')!);
    await settle(50);
    expect(document.querySelector('dialog[open]')?.textContent ?? '').toContain('Ekstre Kimliği');
    expect(apiMock.mock.calls.some(([url]) => /\/api\/finance\/accounts\/[^/]+\/statements$/.test(String(url)))).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: /Vazgeç/ })[0]);
    await settle(50);
    await openStatement('BE-2026-0001');
    toggleMenu();
    expect(item('statement-line-match').getAttribute('aria-disabled')).toBe('true');
    expect(item('statement-reconcile').getAttribute('title')).toBe('Mutabakat için tüm ekstre satırları eşleşmiş olmalıdır.');
    toggleMenu();
    fireEvent.click(screen.getByText('Satır 1').closest('tr')!);
    await settle(50);
    toggleMenu();
    expect(item('statement-line-book').getAttribute('aria-disabled')).toBe('true');
    expect(item('statement-line-match').getAttribute('title')).toBe('Satırda bir defter hareketi seçin');
  });
});
