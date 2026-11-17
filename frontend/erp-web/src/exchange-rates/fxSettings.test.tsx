import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import FxSettingsPage from '../FxSettingsPage';

const rate = (id: string, currencyCode: string, rateDate: string, value: number, source: string | null, revision = 1) => ({
  id, currencyCode, rateDate, rate: value, source, revision, createdAt: `${rateDate}T16:50:00Z`, baseCurrencyCode: 'TRY',
});
let rates = [rate('r1', 'USD', '2026-11-17', 34.1234, 'TCMB ForexSelling · 2026-11-17'), rate('r2', 'EUR', '2026-11-17', 37.5, 'Banka satış kuru')];
const voucherSummary = { id: 'v1', code: 'KDF-2026-0001', asOfDate: '2026-10-31', baseCurrencyCode: 'TRY', lineCount: 2, totalDebit: 1250, totalCredit: 1250, createdAt: '2026-11-01T09:00:00Z' };
const voucher = { ...voucherSummary, lines: [] };

function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  if (path === '/api/finance/currency') return { baseCurrencyCode: init?.method === 'PUT' ? JSON.parse(String(init.body)).baseCurrencyCode : 'TRY' };
  if (path === '/api/finance/exchange-rates') return init?.method ? {} : rates;
  if (path === '/api/finance/exchange-rates/import-tcmb') return { rateDate: '2026-11-18', imported: 3, skipped: 1, baseCurrencyCode: 'TRY' };
  if (path === '/api/finance/fx-revaluations') return init?.method === 'POST' ? { ...voucher, id: 'v2', code: 'KDF-2026-0002' } : [voucherSummary];
  if (path === '/api/finance/fx-revaluations/v1') return voucher;
  if (path === '/api/finance/fx-exposure') return { baseCurrencyCode: 'TRY', summaries: [], invoices: [] };
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
  apiMock.mockImplementation(async (url: string, _token: string, init?: RequestInit) => respond(url, init));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  apiMock.mockClear();
  sessionStorage.clear();
  localStorage.clear();
  rates = [rate('r1', 'USD', '2026-11-17', 34.1234, 'TCMB ForexSelling · 2026-11-17'), rate('r2', 'EUR', '2026-11-17', 37.5, 'Banka satış kuru')];
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
async function settle(ms = 200) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const calls = (path: string, method: string) =>
  apiMock.mock.calls.filter(([url, , init]) => url === path && (init as RequestInit | undefined)?.method === method);
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

// --- Interaction steps (the only part that follows the UI) ---
async function openPage(role = 'TenantAdmin') {
  renderScreen(<FxSettingsPage token="t" role={role} />);
  await settle();
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const barCommand = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
async function runMenu(id: string) {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(barCommand('more'));
  fireEvent.click(document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!);
  await settle();
}
async function showTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
  await settle(50);
}
const rateForm = () => screen.getByLabelText(/^Kaynak \/ not$/).closest('form')!;
const rateField = (label: RegExp) => within(rateForm()).getByLabelText(label) as HTMLInputElement;
async function enterRate(code: string, date: string, value: string, source: string) {
  if (!screen.queryByLabelText(/^Kaynak \/ not$/)) {
    fireEvent.click(barCommand('new'));
    await settle(50);
  }
  fireEvent.change(rateField(/^Döviz/), { target: { value: code } });
  fireEvent.change(rateField(/^Tarih/), { target: { value: date } });
  fireEvent.change(rateField(/^1 .+ = \? TRY$/), { target: { value } });
  fireEvent.change(rateField(/^Kaynak \/ not$/), { target: { value: source } });
  fireEvent.submit(rateField(/^Kaynak \/ not$/).closest('form')!);
  await settle();
}
async function importTcmb() {
  await runMenu('fx-import-tcmb');
}
async function changeBase(code: string) {
  const input = screen.getByLabelText('Baz para birimi') as HTMLInputElement;
  fireEvent.change(input, { target: { value: code } });
  fireEvent.submit(input.closest('form')!);
  await settle();
}
async function createRevaluation(date: string) {
  await showTab('Değerleme fişleri');
  fireEvent.click(barCommand('new'));
  await settle(50);
  fireEvent.change(screen.getByLabelText(/^Dönem sonu tarihi/), { target: { value: date } });
  fireEvent.click(barCommand('save'));
  await settle(50);
  fireEvent.click(screen.getByRole('button', { name: /^Fişi oluştur/ }));
  await settle();
}
async function openVoucher(code: string) {
  if (!screen.queryByText(code)) await showTab('Değerleme fişleri');
  const row = screen.getByText(code).closest('tr')!;
  fireEvent.click(row.querySelector('button.row-action') ?? row);
  await settle();
}
// ---

describe('Kur ve değerleme (characterization)', () => {
  it('posts a manual rate with currency, date, numeric rate and source', async () => {
    await openPage();
    await enterRate('usd', '2026-11-18', '34.5', 'Banka satış kuru');
    const posted = calls('/api/finance/exchange-rates', 'POST');
    expect(posted).toHaveLength(1);
    expect(bodyOf(posted[0])).toEqual({ currencyCode: 'USD', rateDate: '2026-11-18', rate: 34.5, source: 'Banka satış kuru' });
  });

  it('sends an empty source as null', async () => {
    await openPage();
    await enterRate('EUR', '2026-11-18', '37.25', '');
    expect(bodyOf(calls('/api/finance/exchange-rates', 'POST')[0])).toEqual({ currencyCode: 'EUR', rateDate: '2026-11-18', rate: 37.25, source: null });
  });

  it('imports TCMB rates with a bodyless POST', async () => {
    await openPage();
    await importTcmb();
    const posted = calls('/api/finance/exchange-rates/import-tcmb', 'POST');
    expect(posted).toHaveLength(1);
    expect((posted[0][2] as RequestInit).body).toBeUndefined();
  });

  it('changes the base currency with a PUT while no rate exists', async () => {
    rates = [];
    await openPage();
    await changeBase('eur');
    const put = calls('/api/finance/currency', 'PUT');
    expect(put).toHaveLength(1);
    expect(bodyOf(put[0])).toEqual({ baseCurrencyCode: 'EUR' });
  });

  it('creates a revaluation voucher for the chosen date after confirmation and opens a stored one', async () => {
    await openPage();
    await createRevaluation('2026-10-31');
    const posted = calls('/api/finance/fx-revaluations', 'POST');
    expect(posted).toHaveLength(1);
    expect(bodyOf(posted[0])).toEqual({ asOfDate: '2026-10-31' });
    await openVoucher('KDF-2026-0001');
    expect(apiMock.mock.calls.some(([url]) => url === '/api/finance/fx-revaluations/v1')).toBe(true);
  });

  it('asks before Yeni or a row replaces a typed rate', async () => {
    await openPage();
    fireEvent.click(barCommand('new'));
    await settle(50);
    fireEvent.change(rateField(/^1 .+ = \? TRY$/), { target: { value: '35' } });
    fireEvent.click(barCommand('new'));
    await settle(50);
    expect(screen.getByText('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Vazgeç/ }).at(-1)!);
    await settle(50);
    expect(rateField(/^1 .+ = \? TRY$/).value).toBe('35');
  });

  it('gives a tenant user no rate entry, TCMB import or revaluation', async () => {
    await openPage('TenantUser');
    expect(screen.queryByLabelText(/^Kaynak \/ not$/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'TCMB’den çek' })).toBeNull();
    expect(screen.queryByLabelText(/^Dönem sonu tarihi/)).toBeNull();
  });
});
