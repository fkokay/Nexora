import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import CreditFacilitiesPage from '../CreditFacilitiesPage';

// Characterization of the five credit create screens (own routes): the POST bodies, the account / credit guards, the
// repayment prefill from an instalment, the reload and the way back to the list, and the GETs each screen fires.
const schedule = (id: string, dueDate: string, status: string) => ({
  id, dueDate, principalAmount: 1000, interestAmount: 200, feeAmount: 10, status, paidDate: null, notes: null,
});
const facility = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, lenderName: 'Ziraat Bankası', facilityType: 'Loan', currencyCode: 'TRY', approvedLimit: 1000000, startDate: '2026-01-10',
  maturityDate: '2027-01-10', annualInterestRatePercent: 42, status, notes: null, totalDrawdown: 5000, principalRepaid: 0,
  outstandingPrincipal: 5000, openScheduleCount: 1, openScheduleTotal: 1210, schedule: [], movements: [], ...extra,
});
const facilities = [
  facility('f1', 'KRD-001', 'Active', { schedule: [schedule('s1', '2026-12-01', 'Planned')] }),
  facility('f3', 'KRD-003', 'Closed'),
];
const account = (id: string, code: string, currencyCode: string, isActive = true) => ({ id, code, name: code, type: 1, currencyCode, isActive, balance: 0 });
const accounts = [account('a1', 'BNK-TRY', 'TRY'), account('a2', 'BNK-USD', 'USD'), account('a3', 'BNK-OLD', 'TRY', false)];

const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/credit-facilities/') return facilities;
  if (path === '/api/finance/accounts/') return accounts;
  if (path === '/api/finance/credit-facilities/securities') return { items: [], expiringCount: 0, expiredCount: 0 };
  if (path === '/api/finance/credit-facilities/exposure-summary') return { currencies: [], facilities: [] };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  return {};
}
vi.mock('../authApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../authApi')>()),
  authenticatedFetch: vi.fn(async (url: string, _token: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(respond(String(url))), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T10:00:00'));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
const writes = () => fetchCalls.filter((call) => call.method !== 'GET').map(({ url, method, body }) => ({ url, method, body }));
const gets = (path: string) => fetchCalls.filter((call) => call.method === 'GET' && call.url === path).length;
const allGets = () => fetchCalls.filter((call) => call.method === 'GET').map((call) => call.url).sort();
const anyId = expect.any(String);

// --- Interaction steps (the only part that follows the UI) ---
/** The control of the form label whose own text (without the control and the required mark) is `text`. */
function field(text: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const label = Array.from(document.querySelectorAll('label')).find((candidate) => {
    const copy = candidate.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('input, select, textarea, small').forEach((node) => node.remove());
    return copy.textContent?.replace(/[*\s]+$/, '').trim() === text;
  });
  if (!label) throw new Error(`No field "${text}"`);
  return label.querySelector('input, select, textarea')!;
}
function fill(text: string, value: string) {
  fireEvent.change(field(text), { target: { value } });
}
async function save() {
  fireEvent.submit(document.querySelector('form')!);
  await settle();
}
function operationDraft(facilityId: string, view: string) {
  sessionStorage.setItem('credit-facility-operation-draft', JSON.stringify({ facilityId, view }));
}
// ---

const BACK = ['finance-credit-facilities', 'Krediler & Finansman'];
const LOAD_GETS = [
  '/api/finance/accounts/',
  '/api/finance/credit-facilities/',
  '/api/finance/credit-facilities/exposure-summary',
  '/api/finance/credit-facilities/securities?expiryWithinDays=30',
  '/api/screen-views/finance-credit-exposure-facilities/active',
  '/api/screen-views/finance-credit-movements/active',
  '/api/screen-views/finance-credit-schedules/active',
];

describe('Krediler & Finansman: create screens (characterization)', () => {
  it('Yeni kredi / limit POSTs the facility body, reloads and returns to the list', async () => {
    const onNavigate = vi.fn();
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="facility-create" onNavigate={onNavigate} />);
    await settle(900);
    expect(allGets()).toEqual(LOAD_GETS);
    fill('Kod', 'KRD-010');
    fill('Banka / finansman kurumu', 'Halkbank');
    fill('Ürün türü', 'Revolving');
    fill('Para birimi', 'usd');
    fill('Onaylı limit', '500000');
    fill('Yıllık faiz (%)', '35.5');
    fill('Vade sonu', '2027-11-18');
    fill('Not', 'BCH');
    await save();
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/',
        method: 'POST',
        body: {
          code: 'KRD-010', lenderName: 'Halkbank', facilityType: 'Revolving', currencyCode: 'USD', approvedLimit: 500000,
          startDate: '2026-11-18', maturityDate: '2027-11-18', annualInterestRatePercent: 35.5, notes: 'BCH',
        },
      },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
    expect(onNavigate).toHaveBeenLastCalledWith(...BACK);
  });

  it('an empty rate, maturity and note are sent as null', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="facility-create" />);
    await settle(900);
    fill('Kod', 'KRD-011');
    fill('Banka / finansman kurumu', 'Vakıfbank');
    fill('Onaylı limit', '1000');
    await save();
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/',
        method: 'POST',
        body: {
          code: 'KRD-011', lenderName: 'Vakıfbank', facilityType: 'Loan', currencyCode: 'TRY', approvedLimit: 1000,
          startDate: '2026-11-18', maturityDate: null, annualInterestRatePercent: null, notes: null,
        },
      },
    ]);
  });

  it('Taksit planla starts with the selected credit (active credits only) and POSTs the instalment; without a credit nothing is sent', async () => {
    const onNavigate = vi.fn();
    operationDraft('f1', 'schedule-create');
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="schedule-create" onNavigate={onNavigate} />);
    await settle(900);
    expect(allGets()).toEqual(LOAD_GETS);
    expect(field('Kredi / limit').value).toBe('f1');
    expect(Array.from((field('Kredi / limit') as HTMLSelectElement).options).map((option) => option.value)).toEqual(['', 'f1']);
    fill('Vade tarihi', '2027-01-15');
    fill('Anapara', '5000');
    fill('Faiz', '450');
    await save();
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/f1/schedule',
        method: 'POST',
        body: { dueDate: '2027-01-15', principalAmount: 5000, interestAmount: 450, feeAmount: 0, notes: null },
      },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
    expect(onNavigate).toHaveBeenLastCalledWith(...BACK);
    cleanup();
    fetchCalls.length = 0;
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="schedule-create" />);
    await settle(900);
    fill('Anapara', '5000');
    await save();
    expect(writes()).toEqual([]);
  });

  it('Kullandırım offers only active accounts in the credit currency and POSTs the drawdown with a request id; without an account nothing is sent', async () => {
    const onNavigate = vi.fn();
    operationDraft('f1', 'movement-create');
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="movement-create" onNavigate={onNavigate} />);
    await settle(900);
    expect(allGets()).toEqual(LOAD_GETS);
    expect(field('Kredi / finansman').value).toBe('f1');
    expect(Array.from((field('Kasa / banka hesabı') as HTMLSelectElement).options).map((option) => option.value).filter(Boolean)).toEqual(['a1']);
    fill('Anapara', '20000');
    await save();
    expect(writes()).toEqual([]);
    fill('Kasa / banka hesabı', 'a1');
    fill('İşlem tarihi', '2026-11-17');
    fill('Açıklama', 'İlk kullandırım');
    await save();
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/f1/drawdowns',
        method: 'POST',
        body: { requestId: anyId, financialAccountId: 'a1', transactionDate: '2026-11-17', principalAmount: 20000, notes: 'İlk kullandırım' },
      },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
    expect(onNavigate).toHaveBeenLastCalledWith(...BACK);
  });

  it('Geri ödeme from an instalment starts prefilled and POSTs the repayment with the instalment', async () => {
    const onNavigate = vi.fn();
    sessionStorage.setItem(
      'credit-facility-payment-draft',
      JSON.stringify({ facilityId: 'f1', scheduleId: 's1', principal: '1000', interest: '200', fee: '10' }),
    );
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="repayment-create" onNavigate={onNavigate} />);
    await settle(900);
    expect(allGets()).toEqual(LOAD_GETS);
    expect(field('Kredi / finansman').value).toBe('f1');
    expect(field('Ödeme planı').value).toBe('s1');
    expect([field('Anapara').value, field('Faiz').value, field('Ücret / komisyon').value]).toEqual(['1000', '200', '10']);
    fill('Kasa / banka hesabı', 'a1');
    await save();
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/f1/repayments',
        method: 'POST',
        body: {
          requestId: anyId, financialAccountId: 'a1', creditFacilityScheduleId: 's1', transactionDate: '2026-11-18',
          principalAmount: 1000, interestAmount: 200, feeAmount: 10, notes: null,
        },
      },
    ]);
    expect(onNavigate).toHaveBeenLastCalledWith(...BACK);
  });

  it('Teminat kaydı starts with the selected credit and POSTs the security in the credit currency', async () => {
    const onNavigate = vi.fn();
    operationDraft('f1', 'security-create');
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" view="security-create" onNavigate={onNavigate} />);
    await settle(900);
    expect(allGets()).toEqual(LOAD_GETS);
    expect(field('Bağlı kredi').value).toBe('f1');
    fill('Kayıt türü', 'Collateral');
    fill('Kod', 'TM-9');
    fill('Veren kurum / taraf', 'Ziraat');
    fill('Lehtar', 'Gümrük');
    fill('Tutar', '75000');
    fill('Komisyon tutarı', '125.5');
    fill('Vade tarihi', '2027-05-01');
    await save();
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/f1/securities',
        method: 'POST',
        body: {
          type: 'Collateral', code: 'TM-9', issuer: 'Ziraat', beneficiary: 'Gümrük', amount: 75000, currencyCode: 'TRY',
          commissionAmount: 125.5, issueDate: '2026-11-18', expiryDate: '2027-05-01', notes: null,
        },
      },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
    expect(onNavigate).toHaveBeenLastCalledWith(...BACK);
  });

  it('a company user sees none of the create forms', async () => {
    for (const view of ['facility-create', 'schedule-create', 'movement-create', 'repayment-create', 'security-create'] as const) {
      renderScreen(<CreditFacilitiesPage token="t" role="TenantUser" view={view} />);
      await settle(300);
      expect(document.querySelector('form')).toBeNull();
      cleanup();
    }
  });
});
