import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import CreditFacilitiesPage from '../CreditFacilitiesPage';

const facility = (id: string, code: string, status: string, outstandingPrincipal: number, openScheduleCount: number) => ({
  id, code, lenderName: 'Ziraat Bankası', facilityType: 'Loan', currencyCode: 'TRY', approvedLimit: 1000000, startDate: '2026-01-10',
  maturityDate: '2027-01-10', annualInterestRatePercent: 42, status, notes: null, totalDrawdown: outstandingPrincipal, principalRepaid: 0,
  outstandingPrincipal, openScheduleCount, openScheduleTotal: openScheduleCount * 1000, schedule: [], movements: [],
});
const facilities = [
  facility('f1', 'KRD-001', 'Active', 250000, 2),
  facility('f2', 'KRD-002', 'Active', 0, 0),
  facility('f3', 'KRD-003', 'Closed', 0, 0),
];

const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
function respond(url: string): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/credit-facilities/') return facilities;
  if (path === '/api/finance/accounts/') return [];
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
const writes = () => fetchCalls.filter((call) => call.method !== 'GET').map(({ url, method, body }) => ({ url, method, body }));
const gets = (path: string) => fetchCalls.filter((call) => call.method === 'GET' && call.url === path).length;

// --- Interaction steps (the only part that follows the UI) ---
// Yeni is the İşlem Çubuğu command; a click on a grid row makes the credit current and its operations are in İşlemler
// ("Hareket kaydet" is labelled "Kullandırım kaydet" there).
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
async function selectFacility(code: string) {
  if (document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  const grid = screen.getByRole('table', { name: 'Krediler' });
  fireEvent.click(within(grid).getByText(code).closest('tr')!);
  await settle(100);
}
const IDS = {
  'Hareket kaydet': ['cf-movement', 'Kullandırım kaydet'],
  'Taksit planla': ['cf-schedule', 'Taksit planla'],
  'Krediyi kapat': ['cf-status', 'Krediyi kapat'],
  'Krediyi etkinleştir': ['cf-status', 'Krediyi etkinleştir'],
} as const;
function command(label: keyof typeof IDS): HTMLElement | null {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(bar().querySelector<HTMLElement>('[data-command="more"]')!);
  const [id, text] = IDS[label];
  const item = document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`);
  return item && item.textContent?.includes(text) ? item : null;
}
const enabled = (item: HTMLElement | null) => !!item && item.getAttribute('aria-disabled') !== 'true';
async function run(label: keyof typeof IDS) {
  fireEvent.click(command(label)!);
  await settle();
}
async function createFacility() {
  fireEvent.click(bar().querySelector<HTMLElement>('[data-command="new"]')!);
  await settle(50);
}
const createAvailable = () => bar().querySelector<HTMLElement>('[data-command="new"]')?.getAttribute('aria-disabled') !== 'true';
// ---

describe('Krediler & Finansman (characterization)', () => {
  it('loads credits, accounts, securities (30-day expiry) and the exposure summary, plus the four screen views', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    expect(gets('/api/finance/credit-facilities/')).toBe(1);
    expect(gets('/api/finance/accounts/')).toBe(1);
    expect(gets('/api/finance/credit-facilities/securities?expiryWithinDays=30')).toBe(1);
    expect(gets('/api/finance/credit-facilities/exposure-summary')).toBe(1);
    expect(fetchCalls.filter((call) => call.url.startsWith('/api/screen-views/')).map((call) => call.url).sort()).toEqual([
      '/api/screen-views/finance-credit-exposure-facilities/active',
      '/api/screen-views/finance-credit-movements/active',
      '/api/screen-views/finance-credit-schedules/active',
      '/api/screen-views/finance-credit-securities/active',
    ]);
  });

  it('closing a credit PUTs { status: Closed } and reloads; reactivating PUTs Active; a credit with open principal cannot be closed', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    await selectFacility('KRD-001');
    expect(enabled(command('Krediyi kapat'))).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    await settle(50);
    await selectFacility('KRD-002');
    await run('Krediyi kapat');
    await selectFacility('KRD-003');
    await run('Krediyi etkinleştir');
    expect(writes()).toEqual([
      { url: '/api/finance/credit-facilities/f2/status', method: 'PUT', body: { status: 'Closed' } },
      { url: '/api/finance/credit-facilities/f3/status', method: 'PUT', body: { status: 'Active' } },
    ]);
    expect(gets('/api/finance/credit-facilities/')).toBe(3);
  });

  it('the operations open their own screens with the selected credit; a closed credit offers none; Yeni opens the credit form', async () => {
    const onNavigate = vi.fn();
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" onNavigate={onNavigate} />);
    await settle(900);
    await selectFacility('KRD-002');
    await run('Hareket kaydet');
    expect(onNavigate).toHaveBeenLastCalledWith('finance-credit-movement-create', 'Kredi kullandırımı');
    expect(JSON.parse(sessionStorage.getItem('credit-facility-operation-draft')!)).toEqual({ facilityId: 'f2', view: 'movement-create' });
    await run('Taksit planla');
    expect(onNavigate).toHaveBeenLastCalledWith('finance-credit-schedule-create', 'Taksit planla');
    expect(JSON.parse(sessionStorage.getItem('credit-facility-operation-draft')!)).toEqual({ facilityId: 'f2', view: 'schedule-create' });
    await selectFacility('KRD-003');
    expect(enabled(command('Hareket kaydet'))).toBe(false);
    expect(enabled(command('Taksit planla'))).toBe(false);
    await createFacility();
    expect(onNavigate).toHaveBeenLastCalledWith('finance-credit-facility-create', 'Yeni kredi / limit');
    expect(writes()).toEqual([]);
  });

  it('a company user gets no create and no credit operations', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantUser" />);
    await settle(900);
    await selectFacility('KRD-002');
    expect(createAvailable()).toBe(false);
    expect(enabled(command('Hareket kaydet'))).toBe(false);
    expect(enabled(command('Taksit planla'))).toBe(false);
    expect(enabled(command('Krediyi kapat'))).toBe(false);
  });
});

describe('Krediler listesi', () => {
  it('the per-currency footer totals follow the status chip like "Gösterilen n / N"', async () => {
    renderScreen(<CreditFacilitiesPage token="t" role="TenantAdmin" />);
    await settle(900);
    const footer = () => document.querySelector<HTMLElement>('.cf-footer-currency')!.textContent!.replace(/\s+/g, ' ');
    expect(footer()).toContain('Limit 3.000.000,00');
    expect(footer()).toContain('Açık anapara 250.000,00');
    fireEvent.click(screen.getAllByRole('button', { name: /^Kapalı/ }).find((node) => node.closest('.list-v2-toolbar'))!);
    await settle(200);
    expect(footer()).toContain('Limit 1.000.000,00');
    expect(footer()).toContain('Açık anapara 0,00');
  });
});
