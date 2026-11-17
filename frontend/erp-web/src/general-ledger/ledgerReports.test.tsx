import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { localDateString } from '../erpApi';
import GeneralLedgerPage from '../GeneralLedgerPage';
import { startOfMonth, startOfYear } from './ledgerReportUtils';

const tbRow = (accountId: string, code: string, name: string, debit: number, credit: number) => ({
  accountId, code, name, isActive: true, statementSection: 'Asset', openingDebit: 0, openingCredit: 0, debit, credit,
  balanceDebit: Math.max(0, debit - credit), balanceCredit: Math.max(0, credit - debit),
});
const trialBalance = {
  from: null, to: null, basis: 'TDHP',
  accounts: [tbRow('11111111-1111-1111-1111-111111111111', '100', 'Kasa', 500, 200), tbRow('22222222-2222-2222-2222-222222222222', '600', 'Yurt içi satışlar', 0, 300)],
  totalOpeningDebit: 0, totalOpeningCredit: 0, totalDebit: 500, totalCredit: 500, isBalanced: true, totalBalanceDebit: 300, totalBalanceCredit: 300, isComplete: true,
};
const balanceSheet = {
  asOfDate: '2026-11-18', baseCurrencyCode: 'TRY', basis: 'TDHP',
  accounts: [{ accountId: 'a100', code: '100', name: 'Kasa', isActive: true, statementSection: 'Asset', debit: 500, credit: 200, balance: 300 }],
  totals: { assets: 300, liabilities: 0, equity: 0, revenue: 300, expenses: 0, cumulativeResult: 300, liabilitiesAndEquity: 300, difference: 0 },
  unclassifiedAccountCount: 0, unclassifiedAccounts: [], isComplete: true, isBalanced: true,
};
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/general-ledger/trial-balance') return trialBalance;
  if (path === '/api/finance/general-ledger/financial-statements/balance-sheet') return balanceSheet;
  if (path === '/api/finance/general-ledger/accounts') return [];
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
/** Query parameters of the report requests to `path`, in order. */
const requests = (path: string) =>
  apiMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.split('?')[0] === path)
    .map((url) => Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? '')));
const TB = '/api/finance/general-ledger/trial-balance';
const BS = '/api/finance/general-ledger/financial-statements/balance-sheet';

// --- Interaction steps (the only part that follows the UI) ---
async function choose(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
}
async function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await settle();
}
// ---

describe('Mizan (characterization)', () => {
  it('requests the TDHP trial balance from the start of the year to today, then follows period and basis', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="trial-balance" />);
    await settle();
    expect(requests(TB).at(-1)).toEqual({ basis: 'TDHP', from: startOfYear(), to: localDateString() });
    await choose('Bu ay');
    expect(requests(TB).at(-1)).toEqual({ basis: 'TDHP', from: startOfMonth(), to: localDateString() });
    await choose('Özel');
    await setDate('Başlangıç', '2026-03-01');
    await setDate('Bitiş', '2026-03-31');
    expect(requests(TB).at(-1)).toEqual({ basis: 'TDHP', from: '2026-03-01', to: '2026-03-31' });
    await choose('IFRS');
    expect(requests(TB).at(-1)).toEqual({ basis: 'IFRS', from: '2026-03-01', to: '2026-03-31' });
  });

  it('sends nothing for a reversed custom range', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="trial-balance" />);
    await settle();
    await choose('Özel');
    const before = requests(TB).length;
    await setDate('Başlangıç', '2026-05-01');
    await setDate('Bitiş', '2026-04-01');
    expect(requests(TB).length).toBe(before + 1);
    expect(requests(TB).at(-1)).toEqual({ basis: 'TDHP', from: '2026-05-01', to: localDateString() });
  });
});

describe('Bilanço (characterization)', () => {
  it('requests the balance sheet as of today, a chosen date, a basis, and a comparison date', async () => {
    renderScreen(<GeneralLedgerPage token="t" role="TenantAdmin" view="balance-sheet" />);
    await settle();
    expect(requests(BS).at(-1)).toEqual({ asOfDate: localDateString(), basis: 'TDHP' });
    await setDate('Bilanço tarihi', '2026-06-30');
    expect(requests(BS).at(-1)).toEqual({ asOfDate: '2026-06-30', basis: 'TDHP' });
    await choose('IFRS');
    expect(requests(BS).at(-1)).toEqual({ asOfDate: '2026-06-30', basis: 'IFRS' });
    const before = requests(BS).length;
    await choose('Karşılaştır');
    const both = requests(BS).slice(before);
    expect(both).toEqual([
      { asOfDate: '2026-06-30', basis: 'IFRS' },
      { asOfDate: `${new Date().getFullYear() - 1}-12-31`, basis: 'IFRS' },
    ]);
  });
});
