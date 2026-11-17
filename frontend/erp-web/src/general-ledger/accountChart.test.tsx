import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../action-bar/ActionBar';
import { CommandProvider } from '../commands/CommandProvider';
import { KeepAliveViews } from '../WorkspaceComponents';
import { ConfirmDialogHost } from '../confirmDialog';
import GeneralLedgerPage from '../GeneralLedgerPage';

const account = (id: string, code: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, code, name, isActive: true, statementSection: 'Asset', hasMovements: false, accountType: 'Asset', normalBalance: 'Debit',
  currencyCode: null, ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified', ...extra,
});
const accounts = [
  account('a100', '100', 'Kasa', { hasMovements: true, currencyCode: 'TRY', ifrsAccountCode: 'IFRS-CASH', ifrsAccountName: 'Cash', ifrsStatementSection: 'Asset' }),
  account('a102', '102', 'Bankalar'),
  account('a10201', '102.01', 'Ziraat Bankası'),
  account('a136', '136', 'Diğer çeşitli alacaklar'),
  account('a320', '320', 'Satıcılar', { statementSection: 'Liability', accountType: 'Liability', normalBalance: 'Credit' }),
];

const overrides = new Map<string, (url: string, init?: RequestInit) => unknown>();
function respond(url: string, init?: RequestInit): unknown {
  const path = url.split('?')[0];
  const override = overrides.get(path);
  if (override) return override(url, init);
  if (path === '/api/finance/general-ledger/accounts') return init?.method ? {} : accounts;
  if (path === '/api/finance/general-ledger/mappings') return [];
  if (path === '/api/finance/general-ledger/trial-balance') return { accounts: [], totalOpeningDebit: 0, totalOpeningCredit: 0, totalDebit: 0, totalCredit: 0, isBalanced: true, totalBalanceDebit: 0, totalBalanceCredit: 0 };
  if (path === '/api/finance/general-ledger/accounts/standard-chart') return { totalAccounts: 300, existingAccounts: 5, accountsToAdd: 295, sourceUrl: 'https://example.test/tdhp' };
  if (path === '/api/finance/general-ledger/accounts/standard-chart/apply') return { addedCount: 295, preservedExistingCount: 5 };
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
  overrides.clear();
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
async function settle(ms = 200) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
const calls = (path: string, method: string) =>
  apiMock.mock.calls.filter(([url, , init]) => url === path && (init as RequestInit | undefined)?.method === method);
const bodyOf = (call: unknown[]) => JSON.parse(String((call[2] as RequestInit).body));

// --- Interaction steps (the only part that follows the UI) ---
async function openChart(role = 'TenantAdmin') {
  renderScreen(<GeneralLedgerPage token="t" role={role} view="accounts" />);
  await settle();
}
/** Selects the account's row of the chart tree. */
async function selectAccount(code: string) {
  const cell = screen.getAllByText(code).find((element) => element.closest('tr.glch-row'))!;
  fireEvent.click(cell.closest('tr')!);
  await settle(50);
}
const bar = () => screen.getByRole('toolbar', { name: 'İşlemler çubuğu' });
const barCommand = (id: string) => bar().querySelector<HTMLElement>(`[data-command="${id}"]`)!;
const barReason = (id: string) => barCommand(id).getAttribute('title') ?? '';
async function runBar(id: string) {
  fireEvent.click(barCommand(id));
  await settle(50);
}
async function runMenu(id: string) {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(barCommand('more'));
  fireEvent.click(document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`)!);
  await settle(50);
}
const menuItem = (id: string) => {
  if (!document.querySelector('[role="menu"]')) fireEvent.click(barCommand('more'));
  return document.querySelector<HTMLElement>(`[role="menuitem"][data-item="${id}"]`);
};
async function startCreate() {
  await runBar('new');
}
async function startChild(code: string) {
  await selectAccount(code);
  await runMenu('ledger-account-child');
}
/** Selecting a row opens the account in the card (definition screen). */
async function startEdit(code: string) {
  await selectAccount(code);
}
async function toggleStatus(code: string) {
  await selectAccount(code);
  await runMenu('ledger-account-status');
}
const enabledDelete = () => (barCommand('delete').getAttribute('aria-disabled') === 'true' ? undefined : barCommand('delete'));
async function deleteSelected() {
  await runBar('delete');
}
async function previewChart() {
  await runMenu('ledger-standard-chart');
}
// ---

const form = () => document.getElementById('ledger-account-record-form') as HTMLFormElement;
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement;
async function submit() {
  fireEvent.submit(form());
  await settle();
}

describe('Hesap planı (characterization)', () => {
  it('posts a new main account with the form values', async () => {
    await openChart();
    await startCreate();
    fireEvent.change(field(/^Hesap kodu/), { target: { value: ' 120 ' } });
    fireEvent.change(field(/^Hesap adı/), { target: { value: 'Alıcılar' } });
    fireEvent.change(field(/^Finansal tablo sınıfı/), { target: { value: 'Asset' } });
    fireEvent.change(field(/^Hesap tipi/), { target: { value: 'Asset' } });
    fireEvent.change(field(/^Çalışma şekli/), { target: { value: 'Debit' } });
    fireEvent.change(field(/^Döviz takibi/), { target: { value: 'usd' } });
    fireEvent.change(field(/^IFRS \/ UFRS hesap kodu/), { target: { value: 'IFRS-AR' } });
    await submit();
    const posted = calls('/api/finance/general-ledger/accounts', 'POST');
    expect(posted).toHaveLength(1);
    expect(bodyOf(posted[0])).toEqual({
      code: '120',
      name: 'Alıcılar',
      isActive: true,
      statementSection: 'Asset',
      accountType: 'Asset',
      normalBalance: 'Debit',
      currencyCode: 'USD',
      ifrsAccountCode: 'IFRS-AR',
      ifrsAccountName: null,
      ifrsStatementSection: 'Unclassified',
    });
  });

  it('posts a sub-account as parent code + segment with the parent statement section', async () => {
    await openChart();
    await startChild('320');
    fireEvent.change(field(/^Alt hesap kodu/), { target: { value: '001' } });
    fireEvent.change(field(/^Hesap adı/), { target: { value: 'Yurt içi satıcılar' } });
    await submit();
    const posted = calls('/api/finance/general-ledger/accounts', 'POST');
    expect(posted).toHaveLength(1);
    expect(bodyOf(posted[0])).toMatchObject({ code: '320.001', name: 'Yurt içi satıcılar', statementSection: 'Liability', isActive: true });
  });

  it('rejects a dotted sub-account segment without a request', async () => {
    await openChart();
    await startChild('320');
    fireEvent.change(field(/^Alt hesap kodu/), { target: { value: '01.02' } });
    fireEvent.change(field(/^Hesap adı/), { target: { value: 'Hatalı' } });
    await submit();
    expect(calls('/api/finance/general-ledger/accounts', 'POST')).toHaveLength(0);
    expect(screen.getByText('Alt hesap koduna tek bir alt kod girin. Örnek: 001 → 120.001.')).toBeTruthy();
  });

  it('puts the edited account with all of its own fields', async () => {
    await openChart();
    await startEdit('100');
    fireEvent.change(field(/^Hesap adı/), { target: { value: 'Merkez kasa' } });
    await submit();
    const put = calls('/api/finance/general-ledger/accounts/a100', 'PUT');
    expect(put).toHaveLength(1);
    expect(bodyOf(put[0])).toEqual({
      code: '100',
      name: 'Merkez kasa',
      isActive: true,
      statementSection: 'Asset',
      accountType: 'Asset',
      normalBalance: 'Debit',
      currencyCode: 'TRY',
      ifrsAccountCode: 'IFRS-CASH',
      ifrsAccountName: 'Cash',
      ifrsStatementSection: 'Asset',
    });
  });

  it('deactivates with a PUT that flips isActive and keeps code, name and section', async () => {
    await openChart();
    await toggleStatus('320');
    const put = calls('/api/finance/general-ledger/accounts/a320', 'PUT');
    expect(put).toHaveLength(1);
    // Same PUT and the same body shape: code, name and section from the account, isActive flipped. The rest of the
    // body comes from the account card's state, as before; the definition screen loads the selected account into the
    // card (and Pasifleştir is closed while the card has unsaved changes), so it now carries this account's own type,
    // balance side and IFRS fields instead of the card's defaults (base: 'Unclassified' / 'Both' / null).
    expect(bodyOf(put[0])).toEqual({
      code: '320', name: 'Satıcılar', isActive: false, statementSection: 'Liability',
      accountType: 'Liability', normalBalance: 'Credit', currencyCode: null,
      ifrsAccountCode: null, ifrsAccountName: null, ifrsStatementSection: 'Unclassified',
    });
  });

  it('deletes only an account without movements and sub-accounts, after confirmation', async () => {
    await openChart();
    // An account with movements is never deleted: Sil explains it and offers Pasife al (Vazgeç sends nothing).
    await selectAccount('100');
    await deleteSelected();
    expect(screen.getByText('100 · Kasa silinemez')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Vazgeç/ }).at(-1)!);
    await settle(50);
    expect(calls('/api/finance/general-ledger/accounts/a100', 'DELETE')).toHaveLength(0);
    await selectAccount('102');
    expect(enabledDelete()).toBeUndefined();
    expect(barReason('delete')).toBe('Alt hesabı olan hesap silinemez; önce alt hesapları kaldırın.');
    await selectAccount('136');
    await deleteSelected();
    expect(screen.getByText('Hesap silinsin mi?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Sil/ }).at(-1)!);
    await settle();
    expect(calls('/api/finance/general-ledger/accounts/a136', 'DELETE')).toHaveLength(1);
  });

  it('previews the standard chart and applies it after confirmation', async () => {
    await openChart();
    await previewChart();
    expect(apiMock.mock.calls.some(([url]) => url === '/api/finance/general-ledger/accounts/standard-chart')).toBe(true);
    expect(screen.getByText(/295 eklenecek/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eksik hesapları ekle' }));
    await settle(50);
    fireEvent.click(screen.getByRole('button', { name: /^Hesapları ekle/ }));
    await settle();
    expect(calls('/api/finance/general-ledger/accounts/standard-chart/apply', 'POST')).toHaveLength(1);
  });

  it('shows no create or edit commands to a tenant user', async () => {
    await openChart('TenantUser');
    expect(barCommand('new').getAttribute('aria-disabled')).toBe('true');
    expect(barReason('new')).toBe('Hesap planını firma yöneticisi düzenler');
    await selectAccount('100');
    // The card is read-only: every field is disabled and Kaydet says why.
    expect(field(/^Hesap adı/).matches(':disabled')).toBe(true);
    expect(barReason('save')).toBe('Hesap planını firma yöneticisi düzenler');
    expect(menuItem('ledger-account-status')).toBeNull();
    expect(menuItem('ledger-account-movements')).not.toBeNull();
  });

  it('asks before switching away from an account with unsaved changes and keeps it when refused', async () => {
    await openChart();
    await selectAccount('100');
    fireEvent.change(field(/^Hesap adı/), { target: { value: 'Değişti' } });
    await settle(50);
    await selectAccount('320');
    expect(screen.getByText('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Vazgeç/ }).at(-1)!);
    await settle(50);
    expect(field(/^Hesap adı/).value).toBe('Değişti');
    expect(barReason('delete')).toBe('Önce değişiklikleri kaydedin veya vazgeçin');
  });

  it('keeps the saved account open in the card after Kaydet', async () => {
    overrides.set('/api/finance/general-ledger/accounts', (_url, init) =>
      init?.method === 'POST' ? account('a120', '120', 'Alıcılar') : [...accounts, account('a120', '120', 'Alıcılar')]);
    await openChart();
    await startCreate();
    fireEvent.change(field(/^Hesap kodu/), { target: { value: '120' } });
    fireEvent.change(field(/^Hesap adı/), { target: { value: 'Alıcılar' } });
    await submit();
    expect(calls('/api/finance/general-ledger/accounts', 'POST')).toHaveLength(1);
    expect(screen.getByText('Hesap kartı')).toBeTruthy();
    expect(field(/^Hesap kodu/).value).toBe('120');
  });
});
