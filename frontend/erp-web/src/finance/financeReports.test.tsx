import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import { localDateString } from '../erpApi';
import CashFlowPage from '../CashFlowPage';
import FxExposurePage from '../FxExposurePage';
import MaturityTrackingPage from '../MaturityTrackingPage';

const today = localDateString();
const yearStart = `${today.slice(0, 4)}-01-01`;
const monthStart = `${today.slice(0, 8)}01`;

const cashFlow = {
  from: yearStart, to: today, basis: 'Cash', statutory: false, unclassifiedMovementCount: 0, isComplete: true,
  currencies: [{ currencyCode: 'TRY', openingBalance: 100, operating: 50, investing: -20, financing: 0, internalTransfers: 0,
    unclassified: 0, openingAdjustments: 0, netChange: 30, closingBalance: 130, reconciles: true }],
};
const tms7 = {
  standard: 'TMS 7', method: 'Indirect', from: yearStart, to: today, baseCurrencyCode: 'TRY',
  openingCashAndCashEquivalents: 100, closingCashAndCashEquivalents: 130,
  operating: { netProfitLoss: 40, nonCashAdjustments: 0, workingCapitalChanges: 10, investingFinancingPnlAdjustments: 0,
    netCashFlow: 50, directOperatingCashFlowComparison: 50, methodDifference: 0 },
  investing: { netCashFlow: -20 }, financing: { netCashFlow: 0 },
  reconciliation: { netChangeInCash: 30, classifiedCashFlows: 30, difference: 0 },
  unclassifiedMovementCount: 0, missingFlowRateCount: 0, openingAdjustmentCount: 0,
  pAndLUnclassifiedAccountCount: 1, unclassifiedBalanceAccounts: [], isComplete: false, certified: false, note: 'Taslak.',
};
const classes = [
  { id: 'acc-600', code: '600', name: 'Yurt içi satışlar', statementSection: 'Revenue', isActive: true, classification: 'Unclassified' },
  { id: 'acc-100', code: '100', name: 'Kasa', statementSection: 'Asset', isActive: true, classification: 'CashEquivalent' },
];
const ledgerAccounts = [
  { id: 'acc-600', code: '600', name: 'Yurt içi satışlar', isActive: true, statementSection: 'Revenue', hasMovements: true },
  { id: 'acc-100', code: '100', name: 'Kasa', isActive: true, statementSection: 'Asset', hasMovements: true },
];
const fxExposure = {
  baseCurrencyCode: 'TRY', asOfDate: today,
  summaries: [{ direction: 'Receivable', currencyCode: 'USD', invoiceCount: 1, outstandingAmount: 100, historicalBaseAmount: 3000,
    currentBaseAmount: 3300, estimatedChangeBase: 300, unconvertedInvoiceCount: 0 }],
  invoices: [{ direction: 'Receivable', invoiceId: 'inv-1', invoiceCode: 'SF-1', counterpartyName: 'Acme', invoiceDate: '2026-10-01',
    currencyCode: 'USD', outstandingAmount: 100, invoiceDateRate: 30, currentRate: 33, historicalBaseAmount: 3000, currentBaseAmount: 3300,
    estimatedChangeBase: 300 }],
};
const maturity = {
  asOfDate: today,
  summaries: [{ direction: 'Receivable', currencyCode: 'TRY', invoiceCount: 1, outstandingAmount: 500, notDue: 0, days1To30: 500,
    days31To60: 0, days61To90: 0, over90Days: 0 }],
  items: [{ direction: 'Receivable', invoiceId: 'inv-2', invoiceCode: 'SF-2', counterpartyName: 'Beta', invoiceDate: '2026-09-01',
    dueDate: '2026-10-01', currencyCode: 'TRY', originalAmount: 500, outstandingAmount: 500, daysOverdue: 12 }],
};

const CF = '/api/finance/general-ledger/financial-statements/cash-flow';
const TMS7 = '/api/finance/general-ledger/financial-statements/tms7/cash-flow';
const CLASSES = '/api/finance/general-ledger/financial-statements/tms7/cash-flow-classifications';
const STATUTORY = '/api/finance/general-ledger/financial-statements/tms7/statement-of-cash-flows';
const FORECAST = '/api/finance/cash-flow/forecast';
const FX = '/api/finance/fx-exposure';
const MAT = '/api/finance/maturities';

function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === CF) return cashFlow;
  if (path === TMS7) return tms7;
  if (path === CLASSES) return classes;
  if (path.startsWith(`${CLASSES}/`)) return {};
  if (path === '/api/finance/general-ledger/accounts') return ledgerAccounts;
  if (path === STATUTORY) return null;
  if (path === FORECAST) return { from: today, months: 12, through: today, baseCurrencyCode: 'TRY', assumptions: '', currencies: [] };
  if (path === FX) return fxExposure;
  if (path === MAT) return maturity;
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return {};
}
const apiMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../erpApi', async (importOriginal) => ({ ...(await importOriginal<typeof import('../erpApi')>()), api: apiMock }));
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: fetchMock,
}));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollTo) HTMLElement.prototype.scrollTo = () => {};
  apiMock.mockImplementation(async (url: string) => respond(url));
  fetchMock.mockImplementation(async (url: string) =>
    new Response(JSON.stringify(respond(url)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  fetchMock.mockClear();
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
/** Every request (api and authenticatedFetch) to `path`, in order, as { method, query, body }. */
const calls = (path: string) =>
  [...apiMock.mock.calls, ...fetchMock.mock.calls]
    .map(([url, , init]) => ({ url: String(url), init: init as RequestInit | undefined }))
    .filter(({ url }) => url.split('?')[0] === path)
    .map(({ url, init }) => ({
      method: init?.method ?? 'GET',
      query: Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? '')),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }));
const queries = (path: string) => calls(path).filter((call) => call.method === 'GET').map((call) => call.query);

// --- Interaction steps (the only part that follows the UI) ---
async function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
}
async function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
  await settle();
}
async function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await settle();
}
/** Yenile of the action bar. */
async function actionBarRefresh() {
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'İşlemler çubuğu' })).getByRole('button', { name: 'Yenile' }));
  await settle();
}
/** Refresh while the TMS 7 tab is open. */
async function tms7Refresh() {
  await actionBarRefresh();
}
/** Refresh of the Döviz Pozisyonu report. */
async function fxRefresh() {
  await actionBarRefresh();
}
// ---

describe('Nakit Akışı (characterization)', () => {
  it('loads both reports, the classifications, the ledger accounts and the forecast for this year on mount', async () => {
    renderScreen(<CashFlowPage token="t" role="TenantAdmin" />);
    await settle();
    expect(queries(CF)).toEqual([{ from: yearStart, to: today }]);
    expect(queries(TMS7)).toEqual([{ from: yearStart, to: today }]);
    expect(queries(CLASSES)).toEqual([{}]);
    expect(queries('/api/finance/general-ledger/accounts')).toEqual([{}]);
    expect(queries(FORECAST)).toEqual([{ from: today, months: '12' }]);
    expect(queries(STATUTORY)).toEqual([]);
  });

  it('follows the period: this month, a custom range, and nothing for a reversed range', async () => {
    renderScreen(<CashFlowPage token="t" role="TenantAdmin" />);
    await settle();
    await click('Bu ay');
    expect(queries(CF).at(-1)).toEqual({ from: monthStart, to: today });
    expect(queries(TMS7).at(-1)).toEqual({ from: monthStart, to: today });
    await click('Özel');
    await setDate('Başlangıç', '2026-03-01');
    await setDate('Bitiş', '2026-03-31');
    expect(queries(CF).at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(queries(TMS7).at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    const before = queries(CF).length;
    await setDate('Başlangıç', '2026-04-15');
    expect(queries(CF).length).toBe(before);
    expect(queries(TMS7).at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31' });
  });

  it('refresh reloads both reports on the summary and only TMS 7 on the other tabs', async () => {
    renderScreen(<CashFlowPage token="t" role="TenantAdmin" />);
    await settle();
    await actionBarRefresh();
    expect(queries(CF).length).toBe(2);
    expect(queries(TMS7).length).toBe(2);
    await openTab(/TMS 7 raporu/);
    expect(queries(STATUTORY)).toEqual([{ from: yearStart, to: today, basis: 'TDHP' }]);
    await tms7Refresh();
    expect(queries(CF).length).toBe(2);
    expect(queries(TMS7).length).toBe(3);
    await openTab(/Hesap sınıflandırması/);
    await actionBarRefresh();
    expect(queries(CF).length).toBe(2);
    expect(queries(TMS7).length).toBe(4);
  });

  it('a class change is saved at once with PUT { classification } and TMS 7 reloads', async () => {
    renderScreen(<CashFlowPage token="t" role="TenantAdmin" />);
    await settle();
    await openTab(/Hesap sınıflandırması/);
    const tmsBefore = queries(TMS7).length;
    fireEvent.change(screen.getByLabelText('600 TMS 7 sınıfı'), { target: { value: 'NonCashIncome' } });
    await settle();
    expect(calls(`${CLASSES}/acc-600`)).toEqual([{ method: 'PUT', query: {}, body: { classification: 'NonCashIncome' } }]);
    expect(queries(TMS7).length).toBe(tmsBefore + 1);
  });

  it('"Sınıflandırmayı tamamla" opens the classification tab with the missing filter', async () => {
    renderScreen(<CashFlowPage token="t" role="TenantAdmin" />);
    await settle();
    await openTab(/TMS 7 raporu/);
    await click('Sınıflandırmayı tamamla');
    expect(screen.getByRole('tab', { name: /Hesap sınıflandırması/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('600 TMS 7 sınıfı')).toBeTruthy();
    expect(screen.queryByLabelText('100 TMS 7 sınıfı')).toBeNull();
  });

  it('a company user sees the classes read-only', async () => {
    renderScreen(<CashFlowPage token="t" role="TenantUser" />);
    await settle();
    await openTab(/Hesap sınıflandırması/);
    expect((screen.getByLabelText('600 TMS 7 sınıfı') as HTMLSelectElement).disabled).toBe(true);
  });
});

describe('Döviz Pozisyonu (characterization)', () => {
  it('requests the exposure once without parameters and again on refresh', async () => {
    renderScreen(<FxExposurePage token="t" role="TenantAdmin" />);
    await settle();
    expect(queries(FX)).toEqual([{}]);
    await fxRefresh();
    expect(queries(FX)).toEqual([{}, {}]);
  });
});

describe('Vade Takibi (characterization)', () => {
  it('requests the maturities once without parameters and again on refresh', async () => {
    renderScreen(<MaturityTrackingPage token="t" role="TenantAdmin" />);
    await settle();
    expect(queries(MAT)).toEqual([{}]);
    await actionBarRefresh();
    expect(queries(MAT)).toEqual([{}, {}]);
  });
});
