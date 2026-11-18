import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import CreditFacilitiesPage from '../CreditFacilitiesPage';

// Characterization of the credit's own writes (today in the detail tabs): instalment pay / cancel, movement reversal,
// interest preview / posting, effective-interest preview, security release / call and "Teminat ekle".
const schedule = (id: string, dueDate: string, status: string) => ({
  id, dueDate, principalAmount: 1000, interestAmount: 200, feeAmount: 10, status, paidDate: status === 'Paid' ? '2026-10-01' : null, notes: null,
});
const movement = (id: string, type: string, transactionDate: string, isReversed = false) => ({
  id, type, transactionDate, principalAmount: 5000, interestAmount: 0, feeAmount: 0, accountCode: 'BNK-01', financialAccountTransactionId: `t-${id}`,
  creditFacilityScheduleId: null, notes: null, reversesMovementId: type === 'Reversal' ? 'm2-original' : null, isReversed,
});
const facility = (id: string, code: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, code, lenderName: 'Ziraat Bankası', facilityType: 'Loan', currencyCode: 'TRY', approvedLimit: 1000000, startDate: '2026-01-10',
  maturityDate: '2027-01-10', annualInterestRatePercent: 42, status, notes: null, totalDrawdown: 5000, principalRepaid: 0,
  outstandingPrincipal: 5000, openScheduleCount: 1, openScheduleTotal: 1210, schedule: [], movements: [], ...extra,
});
const facilities = [
  facility('f1', 'KRD-001', 'Active', {
    schedule: [schedule('s1', '2026-12-01', 'Planned'), schedule('s2', '2026-10-01', 'Paid')],
    movements: [movement('m1', 'Drawdown', '2026-02-01'), movement('m2', 'Repayment', '2026-03-01', true), movement('m3', 'Reversal', '2026-03-05')],
  }),
  facility('f3', 'KRD-003', 'Closed', {
    schedule: [schedule('s3', '2026-12-15', 'Planned')],
    movements: [movement('m4', 'Drawdown', '2026-02-01')],
  }),
  facility('f4', 'KRD-004', 'Active', { startDate: '2026-11-25' }),
  facility('f5', 'KRD-005', 'Active', { annualInterestRatePercent: null }),
];
const security = (id: string, facilityId: string, status: string) => ({
  id, creditFacilityId: facilityId, facilityCode: 'KRD-001', type: 'Guarantee', code: `TM-${id}`, issuer: 'Ziraat', beneficiary: 'Gümrük',
  amount: 75000, currencyCode: 'TRY', commissionAmount: 0, issueDate: '2026-01-10', expiryDate: '2027-05-01', status, notes: null, alert: 'None',
});
const securities = [security('sec1', 'f1', 'Active'), security('sec2', 'f1', 'Released')];

const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
function respond(url: string, method: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/credit-facilities/') return facilities;
  if (path === '/api/finance/accounts/') return [];
  if (path === '/api/finance/credit-facilities/securities') return { items: securities, expiringCount: 0, expiredCount: 0 };
  if (path === '/api/finance/credit-facilities/exposure-summary') return { currencies: [], facilities: [] };
  if (path.startsWith('/api/screen-views/')) return { fields: [] };
  if (path.endsWith('/interest-accrual-preview'))
    return { from: '2026-11-01', to: '2026-11-18', currencyCode: 'TRY', dayCountConvention: 'Actual/365', months: [{ month: '2026-11', accruedInterest: 103.56 }], totalAccruedInterest: 103.56, accountingPosted: false, note: '' };
  if (path.endsWith('/effective-interest-preview'))
    return { facilityCode: 'KRD-001', currencyCode: 'TRY', effectiveAnnualRatePercent: 44.1, initialTransactionCosts: 150.5, dayCountConvention: 'Actual/365', rows: [], note: 'Not' };
  if (path.includes('/interest-accruals/') && method === 'POST') return { id: 'p1', period: '2026-10', accruedInterest: 180, currencyCode: 'TRY', posted: true };
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
const anyId = expect.any(String);

// --- Interaction steps (the only part that follows the UI) ---
// The credit opens from its code in the grid; the credit-wide commands are in İşlemler, row buttons stay on the rows.
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const closeMenu = () => {
  if (document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
};
async function openCredit(code: string) {
  closeMenu();
  const grid = screen.getByRole('table', { name: 'Krediler' });
  fireEvent.click(within(grid).getByRole('button', { name: `Aç: ${code}` }));
  await settle(100);
}
async function openTab(name: string) {
  closeMenu();
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
  await settle(100);
}
/** A button that acts on one row of a tab grid (instalment, movement, security). */
const rowActions = (name: string | RegExp) =>
  screen.queryAllByRole('button', { name }).filter((button) => !button.closest('[aria-modal="true"]'));
const rowAction = (name: string) => rowActions(name)[0] ?? null;
/** A command that acts on the opened credit as a whole. */
function creditAction(label: string): HTMLElement | null {
  const button = screen
    .queryAllByRole('button')
    .find((candidate) => candidate.textContent?.trim() === label && !candidate.closest('[aria-modal="true"]'));
  if (button) return button;
  if (!document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes(label)) ?? null;
}
const available = (item: HTMLButtonElement | HTMLElement | null) =>
  !!item && !(item as HTMLButtonElement).disabled && item.getAttribute('aria-disabled') !== 'true';
async function runCreditAction(label: string) {
  fireEvent.click(creditAction(label)!);
  await settle();
}
async function confirm(label: string) {
  const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]')!;
  fireEvent.click(within(dialog).getByRole('button', { name: label }));
  await settle();
}
function setEffectiveCost(value: string) {
  closeMenu();
  fireEvent.change(screen.getByLabelText(/İlk işlem maliyeti/), { target: { value } });
}
// ---

describe('Krediler & Finansman: credit-level writes (characterization)', () => {
  it('instalments: İptal PUTs { Cancelled, paidDate: null } and reloads; Öde stores the payment draft and opens the repayment screen; paid rows offer nothing', async () => {
    const onNavigate = vi.fn();
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle(900);
    await openCredit('KRD-001');
    await openTab('Ödeme planı');
    expect(rowActions(/2026-10-01 taksidini/)).toHaveLength(0);
    fireEvent.click(rowAction('KRD-001 2026-12-01 taksidini öde')!);
    await settle(100);
    expect(onNavigate).toHaveBeenLastCalledWith('finance-credit-repayment-create', 'Kredi geri ödemesi');
    expect(JSON.parse(sessionStorage.getItem('credit-facility-payment-draft')!)).toEqual({
      facilityId: 'f1', scheduleId: 's1', principal: '1000', interest: '200', fee: '10',
    });
    expect(writes()).toEqual([]);
    fireEvent.click(rowAction('KRD-001 2026-12-01 taksidini iptal et')!);
    await settle();
    expect(writes()).toEqual([
      { url: '/api/finance/credit-facilities/schedule/s1/status', method: 'PUT', body: { status: 'Cancelled', paidDate: null } },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
  });

  it('a closed credit can still cancel a planned instalment but not pay it', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    await openCredit('KRD-003');
    await openTab('Ödeme planı');
    expect(rowAction('KRD-003 2026-12-15 taksidini öde')).toBeNull();
    expect(available(rowAction('KRD-003 2026-12-15 taksidini iptal et'))).toBe(true);
  });

  it('movement reversal: after the confirm, POSTs { requestId, transactionDate = later of today / movement date, notes }; reversed and reversal rows, and a closed credit, offer none', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    await openCredit('KRD-001');
    await openTab('Hareketler');
    expect(rowActions('Ters kayıt')).toHaveLength(1);
    fireEvent.click(rowAction('Ters kayıt')!);
    await settle(100);
    await confirm('Ters kaydı oluştur');
    expect(writes()).toEqual([
      {
        url: '/api/finance/credit-facilities/f1/movements/m1/reversals',
        method: 'POST',
        body: { requestId: anyId, transactionDate: '2026-11-18', notes: 'Kredi hareketi düzeltmesi' },
      },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
    await openCredit('KRD-003');
    await openTab('Hareketler');
    expect(rowActions('Ters kayıt')).toHaveLength(0);
  });

  it('interest: the preview GETs this month clamped to the contract; the previous month posts after the confirm with no body; the effective-interest preview POSTs the cost', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    await openCredit('KRD-001');
    await openTab('Faiz');
    await runCreditAction('Bu ay faiz önizle');
    expect(gets('/api/finance/credit-facilities/f1/interest-accrual-preview?from=2026-11-01&to=2026-11-18')).toBe(1);
    await runCreditAction('Önceki ayı muhasebeleştir');
    await confirm('Muhasebeleştir');
    setEffectiveCost('1.234');
    await runCreditAction('Etkin faiz planını hesapla');
    expect(screen.getByText('İşlem maliyetini sıfır veya pozitif, en fazla iki ondalık girin.')).toBeTruthy();
    setEffectiveCost('150.5');
    await runCreditAction('Etkin faiz planını hesapla');
    expect(writes()).toEqual([
      { url: '/api/finance/credit-facilities/f1/interest-accruals/2026/10', method: 'POST', body: undefined },
      { url: '/api/finance/credit-facilities/f1/effective-interest-preview', method: 'POST', body: { initialTransactionCosts: 150.5 } },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(2);
  });

  it('interest: no rate disables the preview and the posting; a contract starting later sends no preview; no drawdown disables the effective-interest plan', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    await openCredit('KRD-005');
    await openTab('Faiz');
    expect(available(creditAction('Bu ay faiz önizle'))).toBe(false);
    expect(available(creditAction('Önceki ayı muhasebeleştir'))).toBe(false);
    expect(available(creditAction('Etkin faiz planını hesapla'))).toBe(false);
    await openCredit('KRD-004');
    await openTab('Faiz');
    await runCreditAction('Bu ay faiz önizle');
    expect(screen.getByText('Bu ay kredi sözleşmesi dönemi içinde tahakkuk günü yok.')).toBeTruthy();
    expect(fetchCalls.filter((call) => call.url.includes('/interest-'))).toEqual([]);
  });

  it('securities: Serbest bırak / Çağır PUT the status after the confirm; a released security offers none; Teminat ekle opens the security screen even for a closed credit', async () => {
    const onNavigate = vi.fn();
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle(900);
    await openCredit('KRD-001');
    await openTab('Teminatlar');
    expect(rowActions('Serbest bırak')).toHaveLength(1);
    fireEvent.click(rowAction('Serbest bırak')!);
    await settle(100);
    await confirm('Serbest bırak');
    fireEvent.click(rowAction('Çağır')!);
    await settle(100);
    await confirm('Çağrılmış işaretle');
    expect(writes()).toEqual([
      { url: '/api/finance/credit-facilities/f1/securities/sec1/status', method: 'PUT', body: { status: 'Released' } },
      { url: '/api/finance/credit-facilities/f1/securities/sec1/status', method: 'PUT', body: { status: 'Called' } },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(3);
    await openCredit('KRD-003');
    await openTab('Teminatlar');
    await runCreditAction('Teminat ekle');
    expect(onNavigate).toHaveBeenLastCalledWith('finance-credit-security-create', 'Teminat kaydı');
    expect(JSON.parse(sessionStorage.getItem('credit-facility-operation-draft')!)).toEqual({ facilityId: 'f3', view: 'security-create' });
  });

  it('İşlemler › Geri ödeme kaydet (new with the credit surface) opens the repayment screen with the credit; a closed credit cannot', async () => {
    const onNavigate = vi.fn();
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle(900);
    await openCredit('KRD-001');
    await runCreditAction('Geri ödeme kaydet');
    expect(onNavigate).toHaveBeenLastCalledWith('finance-credit-repayment-create', 'Kredi geri ödemesi');
    expect(JSON.parse(sessionStorage.getItem('credit-facility-operation-draft')!)).toEqual({ facilityId: 'f1', view: 'repayment-create' });
    await openCredit('KRD-003');
    expect(available(creditAction('Geri ödeme kaydet'))).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('a company user can preview interest but not post it, and gets no row writes and no Teminat ekle', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantUser" />);
    await settle(900);
    await openCredit('KRD-001');
    await openTab('Ödeme planı');
    expect(rowActions(/taksidini/)).toHaveLength(0);
    await openTab('Hareketler');
    expect(rowActions('Ters kayıt')).toHaveLength(0);
    await openTab('Teminatlar');
    expect(rowActions('Serbest bırak')).toHaveLength(0);
    expect(available(creditAction('Teminat ekle'))).toBe(false);
    await openTab('Faiz');
    expect(available(creditAction('Önceki ayı muhasebeleştir'))).toBe(false);
    await runCreditAction('Bu ay faiz önizle');
    expect(gets('/api/finance/credit-facilities/f1/interest-accrual-preview?from=2026-11-01&to=2026-11-18')).toBe(1);
    expect(writes()).toEqual([]);
  });
});
