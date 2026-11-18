import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import DirectCashBudgetPage from '../DirectCashBudgetPage';

const plan = (id: string, name: string, status: string, revision: number) => ({
  id, name, fiscalYear: 2026, currencyCode: 'TRY', status, lineCount: 1, revision,
  createdAt: '2026-01-02T09:00:00Z', createdByUserId: 'u1', approvedByUserId: status === 'Approved' ? 'u2' : null,
  approvedAt: status === 'Approved' ? '2026-02-01T09:00:00Z' : null,
});
const plans = [plan('c1', 'Nakit planı 2026', 'Draft', 4), plan('c2', 'Onaylı nakit planı', 'Approved', 6)];
const view = (id: string) => {
  const { lineCount: _lineCount, ...summary } = plans.find((p) => p.id === id) ?? plans[0];
  return { ...summary, lines: [{ id: `${id}-l1`, periodStart: '2026-04-01', direction: 'Outflow', category: 'Payroll', description: 'Nisan bordrosu', amount: 125000 }] };
};
const forecast = { currencies: [{ currencyCode: 'TRY', months: [{ periodStart: '2026-04-01', directCashBudgetInflows: 0, directCashBudgetOutflows: 125000, netChange: -125000 }] }] };

const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
function respond(url: string, method: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/cash-budgets/') return method === 'POST' ? view('c1') : plans;
  const one = path.match(/^\/api\/finance\/cash-budgets\/([^/]+)(\/approve)?$/);
  if (one) return view(one[1]);
  if (path === '/api/finance/cash-flow/forecast') return forecast;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
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
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// --- Interaction steps (the only part that follows the UI) ---
async function openPlan(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Aç: ${name}` }));
  await settle();
}
async function approve() {
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  await settle();
}
async function startNew() {
  fireEvent.click(screen.getByRole('button', { name: 'Yeni nakit bütçesi' }));
  await settle(100);
}
async function startEdit() {
  fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
  await settle(100);
}
function fillNewDraft() {
  fireEvent.change(screen.getByLabelText(/Plan adı/), { target: { value: 'Yeni nakit planı' } });
  fireEvent.change(screen.getByLabelText('Açıklama'), { target: { value: 'Peşin satış tahsilatı' } });
  fireEvent.change(screen.getByLabelText('Tutar'), { target: { value: '5000' } });
}
async function submitDraft() {
  fireEvent.submit(screen.getByLabelText(/Plan adı/).closest('form')!);
  await settle();
}
const approveVisible = () => !!screen.queryByRole('button', { name: 'Onayla' });
const createVisible = () => !!screen.queryByRole('button', { name: 'Yeni nakit bütçesi' });
// ---

describe('Doğrudan nakit bütçesi (characterization)', () => {
  it('loads the plans, the 12-month forecast from this month and the screen view; opening a plan reads it', async () => {
    renderScreen(<DirectCashBudgetPage token="t" role="TenantAdmin" />);
    await settle(900);
    expect(calls('/api/finance/cash-budgets/')[0]).toEqual({ method: 'GET', body: undefined });
    const forecastUrl = fetchCalls.find((call) => call.url.startsWith('/api/finance/cash-flow/forecast'))!.url;
    expect(forecastUrl).toBe(`/api/finance/cash-flow/forecast?from=${thisMonth}-01&months=12`);
    expect(calls('/api/screen-views/direct-cash-budgets/active')[0]).toEqual({ method: 'GET', body: undefined });
    await openPlan('Onaylı nakit planı');
    expect(calls('/api/finance/cash-budgets/c2').at(-1)).toEqual({ method: 'GET', body: undefined });
  });

  it('approves a draft with POST /approve and { revision }; an approved plan offers no approval', async () => {
    renderScreen(<DirectCashBudgetPage token="t" role="TenantAdmin" />);
    await settle(900);
    await openPlan('Nakit planı 2026');
    await approve();
    expect(calls('/api/finance/cash-budgets/c1/approve')).toEqual([{ method: 'POST', body: { revision: 4 } }]);
    // After approval the list and the plan reload.
    expect(calls('/api/finance/cash-budgets/').length).toBeGreaterThanOrEqual(2);
    await openPlan('Onaylı nakit planı');
    expect(approveVisible()).toBe(false);
  });

  it('a new draft POSTs the plan body; editing a draft PUTs it with the revision', async () => {
    renderScreen(<DirectCashBudgetPage token="t" role="TenantAdmin" />);
    await settle(900);
    await startNew();
    fillNewDraft();
    await submitDraft();
    expect(calls('/api/finance/cash-budgets/').filter((call) => call.method === 'POST')).toEqual([
      { method: 'POST', body: { name: 'Yeni nakit planı', fiscalYear: now.getFullYear(), currencyCode: 'TRY', revision: 0, lines: [{ periodStart: `${thisMonth}-01`, direction: 'Inflow', category: 'Sales', description: 'Peşin satış tahsilatı', amount: 5000 }] } },
    ]);
    await openPlan('Nakit planı 2026');
    await startEdit();
    await submitDraft();
    expect(calls('/api/finance/cash-budgets/c1').filter((call) => call.method === 'PUT')).toEqual([
      { method: 'PUT', body: { name: 'Nakit planı 2026', fiscalYear: 2026, currencyCode: 'TRY', revision: 4, lines: [{ periodStart: '2026-04-01', direction: 'Outflow', category: 'Payroll', description: 'Nisan bordrosu', amount: 125000 }] } },
    ]);
  });

  it('a company user can read plans but cannot create or approve', async () => {
    renderScreen(<DirectCashBudgetPage token="t" role="TenantUser" />);
    await settle(900);
    await openPlan('Nakit planı 2026');
    expect(calls('/api/finance/cash-budgets/c1').at(-1)).toEqual({ method: 'GET', body: undefined });
    expect(approveVisible()).toBe(false);
    expect(createVisible()).toBe(false);
  });
});
