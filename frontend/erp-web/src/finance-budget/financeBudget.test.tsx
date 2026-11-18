import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import FinanceBudgetPage from '../FinanceBudgetPage';

const accounts = [
  { id: 'a600', code: '600', name: 'Yurt içi satışlar', isActive: true, statementSection: 'Revenue' },
  { id: 'a770', code: '770', name: 'Genel yönetim giderleri', isActive: true, statementSection: 'Expense' },
];
const plan = (id: string, name: string, status: string, revision: number) => ({
  id, name, fiscalYear: 2026, currencyCode: 'TRY', baseCurrencyCode: 'TRY', status, lineCount: 1, plannedTotal: 1000, actualTotal: 400,
  createdAt: '2026-01-02T09:00:00Z', createdByUserId: 'u1', approvedByUserId: status === 'Approved' ? 'u2' : null,
  approvedAt: status === 'Approved' ? '2026-02-01T09:00:00Z' : null, revision,
});
const plans = [plan('b1', 'Ana bütçe 2026', 'Draft', 3), plan('b2', 'Onaylı bütçe 2026', 'Approved', 5)];
const view = (id: string) => ({
  plan: plans.find((p) => p.id === id),
  lines: [{ id: `${id}-l1`, accountId: 'a770', accountCode: '770', accountName: 'Genel yönetim giderleri', statementSection: 'Expense', periodStart: '2026-03-01', plannedAmount: 1000, actualAmount: 400, variance: -600, notes: 'Kira' }],
});

const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/budgets/') return plans;
  const one = path.match(/^\/api\/finance\/budgets\/([^/]+)(\/approve)?$/);
  if (one) return view(one[1] === '' ? 'b1' : one[1]);
  if (path === '/api/finance/general-ledger/accounts') return accounts;
  if (path === '/api/finance/currency') return { baseCurrencyCode: 'TRY' };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return {};
}
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const path = String(url).split('?')[0];
    const body = init?.method === 'POST' && path === '/api/finance/budgets/' ? view('b1') : respond(String(url));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }),
}));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  fetchCalls.length = 0;
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
const calls = (path: string) => fetchCalls.filter((call) => call.url.split('?')[0] === path).map(({ method, body }) => ({ method, body }));

// --- Interaction steps (the only part that follows the UI) ---
// The list opens a plan on the detail surface; Yeni is the İşlem Çubuğu command, Düzenle / Onayla are in İşlemler.
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
function menuItem(id: string) {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  return document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`);
}
const closeMenu = () => {
  if (document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
};
async function openPlan(name: string) {
  if (screen.queryByLabelText('Satır 1 hesap')) {
    fireEvent.click(screen.getAllByRole('button', { name: /Vazgeç/ })[0]);
    await settle(50);
  }
  const back = screen.queryByRole('button', { name: 'Listeye dön' });
  if (back) {
    fireEvent.click(back);
    await settle(50);
  }
  fireEvent.click(screen.getByRole('button', { name: `${name} bütçesini aç` }));
  await settle();
}
async function approve() {
  fireEvent.click(menuItem('budget-approve')!);
  await settle();
}
async function startNew() {
  fireEvent.click(bar().querySelector<HTMLElement>('[data-command="new"]')!);
  await settle(100);
}
async function startEdit() {
  fireEvent.click(menuItem('budget-edit')!);
  await settle(100);
}
function fillNewDraft() {
  fireEvent.change(screen.getByLabelText(/Senaryo adı/), { target: { value: 'Yeni senaryo' } });
  fireEvent.change(screen.getByLabelText('Satır 1 hesap'), { target: { value: 'a600' } });
  fireEvent.change(screen.getByLabelText('Satır 1 plan tutarı'), { target: { value: '2500' } });
}
async function submitDraft() {
  fireEvent.submit(screen.getByLabelText(/Satır 1 hesap/).closest('form')!);
  await settle();
}
const approveVisible = () => {
  const item = menuItem('budget-approve');
  const enabled = !!item && item.getAttribute('aria-disabled') !== 'true';
  closeMenu();
  return enabled;
};
const createVisible = () => bar().querySelector<HTMLElement>('[data-command="new"]')?.getAttribute('aria-disabled') !== 'true';
// ---

describe('Bütçe Planlama (characterization)', () => {
  it('loads plans, accounts and the base currency, then the first plan; opening another plan reads it', async () => {
    renderScreen(<FinanceBudgetPage token="t" role="TenantAdmin" />);
    await settle(900);
    expect(calls('/api/finance/budgets/')[0]).toEqual({ method: 'GET', body: undefined });
    expect(calls('/api/finance/general-ledger/accounts')[0]).toEqual({ method: 'GET', body: undefined });
    expect(calls('/api/finance/currency')[0]).toEqual({ method: 'GET', body: undefined });
    await openPlan('Onaylı bütçe 2026');
    expect(calls('/api/finance/budgets/b2').at(-1)).toEqual({ method: 'GET', body: undefined });
  });

  it('approves a draft with POST /approve (no body); an approved plan offers no approval', async () => {
    renderScreen(<FinanceBudgetPage token="t" role="TenantAdmin" />);
    await settle(900);
    await openPlan('Ana bütçe 2026');
    await approve();
    expect(calls('/api/finance/budgets/b1/approve')).toEqual([{ method: 'POST', body: undefined }]);
    await openPlan('Onaylı bütçe 2026');
    expect(approveVisible()).toBe(false);
  });

  it('a new draft POSTs the plan body; editing a draft PUTs it with the revision', async () => {
    renderScreen(<FinanceBudgetPage token="t" role="TenantAdmin" />);
    await settle(900);
    await startNew();
    fillNewDraft();
    await submitDraft();
    expect(calls('/api/finance/budgets/').filter((call) => call.method === 'POST')).toEqual([
      { method: 'POST', body: { name: 'Yeni senaryo', fiscalYear: new Date().getFullYear(), currencyCode: 'TRY', revision: 0, lines: [{ accountId: 'a600', periodStart: `${new Date().getFullYear()}-01-01`, plannedAmount: 2500, notes: null }] } },
    ]);
    await openPlan('Ana bütçe 2026');
    await startEdit();
    await submitDraft();
    expect(calls('/api/finance/budgets/b1').filter((call) => call.method === 'PUT')).toEqual([
      { method: 'PUT', body: { name: 'Ana bütçe 2026', fiscalYear: 2026, currencyCode: 'TRY', revision: 3, lines: [{ accountId: 'a770', periodStart: '2026-03-01', plannedAmount: 1000, notes: 'Kira' }] } },
    ]);
  });

  it('a company user can read plans but cannot create or approve', async () => {
    renderScreen(<FinanceBudgetPage token="t" role="TenantUser" />);
    await settle(900);
    await openPlan('Ana bütçe 2026');
    expect(approveVisible()).toBe(false);
    expect(createVisible()).toBe(false);
  });
});
